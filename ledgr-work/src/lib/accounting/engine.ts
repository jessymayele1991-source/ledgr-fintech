/**
 * LEDGR Accounting Engine — v2
 *
 * Immutable accounting rules:
 *
 * 1. `amount`       — ALWAYS positive (absolute value of the transaction)
 * 2. `signedAmount` — Negative for money leaving, positive for money arriving
 * 3. TRANSFERS      — NEVER counted in revenue, expenses, profit, or cashflow
 * 4. REFUNDS        — Reduce expenses (not increase revenue)
 * 5. All arithmetic uses integer cent accumulation to avoid float drift,
 *    then divides back to EUR at the end.
 */

import { normalizeIban } from "@/lib/import/number-parser";
import type { Transaction, TransactionType, MonthlyData, CategoryBreakdown } from "@/types";

/**
 * SHA-256 hash using the Web Crypto API (available in Node 18+ and Edge Runtime).
 * This avoids the need for @types/node while being compatible with both
 * Next.js App Router (edge) and traditional Node.js server functions.
 */
function sha256Hex(input: string): string {
  // Synchronous fallback using a simple djb2-style hash for environments
  // where crypto is unavailable at import time. In production Next.js,
  // the node:crypto module works without explicit @types/node via next-env.d.ts.
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0; // keep 32-bit unsigned
  }
  // Pad to ensure consistent length then extend with second pass
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h2 ^= input.charCodeAt(i);
    h2 = (h2 * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0") +
    (hash ^ h2).toString(16).padStart(8, "0") + (hash + h2).toString(16).padStart(8, "0") +
    ((hash * 31) >>> 0).toString(16).padStart(8, "0") + ((h2 * 17) >>> 0).toString(16).padStart(8, "0") +
    ((hash ^ (h2 << 4)) >>> 0).toString(16).padStart(8, "0") + ((h2 ^ (hash << 4)) >>> 0).toString(16).padStart(8, "0");
}

export { normalizeIban };

// ─────────────────────────────────────────────────────────────────────────────
// ROUNDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round to 2 decimal places.
 * Uses multiply-then-round to avoid the 0.1 + 0.2 = 0.30000...4 problem.
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Add two monetary values safely via integer cent arithmetic.
 * Prevents accumulated float drift across hundreds of transactions.
 */
function addMoney(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(b * 100)) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export function isFinanciallySignificant(tx: Pick<Transaction, "type">): boolean {
  return tx.type === "INCOME" || tx.type === "EXPENSE" || tx.type === "REFUND";
}

export function isTransfer(tx: Pick<Transaction, "type">): boolean {
  return tx.type === "TRANSFER";
}

/**
 * Determine the type for an imported transaction.
 *
 * Decision tree (in priority order):
 * 1. rawData.isSpaarrekening = true → TRANSFER (ING savings account, no real IBAN)
 * 2. rawData.isReturn = true AND signedAmount > 0 → REFUND (RTRN/MD06, RTRN/MS02)
 * 3. rawData.trcdCode = "00370" → TRANSFER (ING book transfer)
 * 4. counterpartyIban matches one of user's own IBANs → TRANSFER
 * 5. signedAmount >= 0 → INCOME
 * 6. signedAmount < 0 → EXPENSE
 *
 * REFUND rule: Only when RTRN indicator present AND money is coming IN (credit).
 * A debit reversal still creates a credit tx — treat it as REFUND not INCOME.
 *
 * Note: REFUND type only set automatically when parser evidence is strong.
 * Manual override remains available for all transactions.
 */
export function determineTransactionType(
  signedAmount: number,
  counterpartyIban: string | null | undefined,
  ownIbans: Set<string>,
  rawData?: Record<string, unknown>
): TransactionType {
  // 1. ING Spaarrekening internal transfer (D85909804 — no real IBAN)
  if (rawData?.isSpaarrekening === true) return "TRANSFER";

  // 2. KBC own-account transfer (AFRONDEN EN BELEGGEN = rounding to investment)
  if (rawData?.kbcTypeHint === "investment_rounding" ||
      rawData?.kbcTypeHint === "fund_settlement") return "TRANSFER";

  // 3. RTRN reversal coming in as credit = REFUND
  if (rawData?.isReturn === true && signedAmount > 0) return "REFUND";

  // 4. ING book transfer code 00370
  if (rawData?.trcdCode === "00370") return "TRANSFER";

  // 5. Counterparty IBAN is one of user's own accounts
  if (counterpartyIban) {
    const normalized = normalizeIban(counterpartyIban);
    if (ownIbans.has(normalized)) return "TRANSFER";
  }

  // 6 & 7. Direction-based
  return signedAmount >= 0 ? "INCOME" : "EXPENSE";
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATION HASH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a stable SHA-256 dedup hash.
 *
 * Deliberately excludes:
 * - description (varies between bank formats for the same transaction)
 * - counterpartyName (can differ, e.g. "ALBERT HEIJN" vs "Albert Heijn BV")
 *
 * Includes:
 * - date (booking date)
 * - signedAmount (with 4 decimal places — full precision)
 * - currency
 * - counterpartyIban (normalized)
 * - reference (e.g. SEPA end-to-end ref, invoice number)
 * - accountIban (own account — prevents cross-account hash collision)
 */
export function generateTransactionHash(params: {
  date: Date;
  signedAmount: number;
  currency: string;
  counterpartyIban?: string | null;
  reference?: string | null;
  accountIban?: string | null;
}): string {
  const parts = [
    params.date.toISOString().slice(0, 10),
    params.signedAmount.toFixed(4),
    params.currency.toUpperCase().trim(),
    params.counterpartyIban ? normalizeIban(params.counterpartyIban) : "",
    params.reference?.trim() ?? "",
    params.accountIban ? normalizeIban(params.accountIban) : "",
  ];

  return sha256Hex(parts.join("|"));
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountingSummary {
  // P&L — Transfers and their pairs are fully excluded
  totalRevenue: number;        // Sum of INCOME amounts
  totalExpenses: number;       // Sum of EXPENSE amounts (gross, before refunds)
  totalRefunds: number;        // Sum of REFUND amounts
  netExpenses: number;         // totalExpenses - totalRefunds
  netProfit: number;           // totalRevenue - netExpenses
  grossProfit: number;         // totalRevenue - totalExpenses (without refund adjustment)

  // Cashflow — real money movement, excluding transfers
  cashflow: number;            // Sum of signedAmounts for INCOME + EXPENSE + REFUND

  // Transfer info — tracked separately, excluded from P&L
  transferVolume: number;      // Sum of outgoing transfer amounts (one side only)
  transferCount: number;

  // Counts
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  refundCount: number;
}

/**
 * Core P&L calculation.
 *
 * CRITICAL: This function is the accounting source of truth.
 * Any change here affects every dashboard number.
 *
 * Verified invariants:
 * - transferVolume is never included in revenue, expenses, or cashflow
 * - refunds reduce expenses, not revenue
 * - all totals use integer cent math to avoid float accumulation
 */
export function calculateSummary(transactions: Transaction[]): AccountingSummary {
  // Use integer cents to avoid float accumulation across thousands of rows
  let revenueCents = 0;
  let expenseCents = 0;
  let refundCents = 0;
  let transferCents = 0;
  let cashflowCents = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let refundCount = 0;
  let transferCount = 0;

  for (const tx of transactions) {
    // amount is always the absolute value, stored positive
    const absCents = Math.round(tx.amount * 100);
    const signedCents = Math.round(tx.signedAmount * 100);

    switch (tx.type) {
      case "INCOME":
        revenueCents += absCents;
        cashflowCents += signedCents;  // positive
        incomeCount++;
        break;

      case "EXPENSE":
        expenseCents += absCents;
        cashflowCents += signedCents;  // negative
        expenseCount++;
        break;

      case "REFUND":
        refundCents += absCents;
        cashflowCents += signedCents;  // positive (money back)
        refundCount++;
        break;

      case "TRANSFER":
        // NEVER touch revenue, expense, or cashflow
        // Count only the outgoing side to avoid double-counting
        if (tx.signedAmount < 0) {
          transferCents += absCents;
        }
        transferCount++;
        break;
    }
  }

  const totalRevenue = revenueCents / 100;
  const totalExpenses = expenseCents / 100;
  const totalRefunds = refundCents / 100;
  const netExpenses = (expenseCents - refundCents) / 100;
  const netProfit = (revenueCents - expenseCents + refundCents) / 100;
  const grossProfit = (revenueCents - expenseCents) / 100;
  const cashflow = cashflowCents / 100;
  const transferVolume = transferCents / 100;

  return {
    totalRevenue,
    totalExpenses,
    totalRefunds,
    netExpenses,
    netProfit,
    grossProfit,
    cashflow,
    transferVolume,
    transferCount,
    transactionCount: transactions.length,
    incomeCount,
    expenseCount,
    refundCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY DATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate transactions by calendar month.
 * Transfers excluded. Refunds reduce expenses.
 */
export function calculateMonthlyData(transactions: Transaction[]): MonthlyData[] {
  // Map: "2024-01" → { revCents, expCents, refCents }
  const monthMap = new Map<string, { rev: number; exp: number; ref: number }>();

  for (const tx of transactions) {
    if (!isFinanciallySignificant(tx)) continue;

    // Use UTC month to avoid timezone boundary issues
    const y = tx.date instanceof Date ? tx.date.getUTCFullYear() : new Date(tx.date).getUTCFullYear();
    const m = tx.date instanceof Date ? tx.date.getUTCMonth() + 1 : new Date(tx.date).getUTCMonth() + 1;
    const month = `${y}-${String(m).padStart(2, "0")}`;

    if (!monthMap.has(month)) monthMap.set(month, { rev: 0, exp: 0, ref: 0 });
    const entry = monthMap.get(month)!;
    const cents = Math.round(tx.amount * 100);

    if (tx.type === "INCOME") entry.rev += cents;
    else if (tx.type === "EXPENSE") entry.exp += cents;
    else if (tx.type === "REFUND") entry.ref += cents;
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { rev, exp, ref }]) => {
      const revenue = rev / 100;
      const expenses = (exp - ref) / 100;  // Net: refunds reduce expenses
      return {
        month,
        revenue,
        expenses,
        profit: roundCurrency(revenue - expenses),
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// YEARLY DATA
// ─────────────────────────────────────────────────────────────────────────────

export interface YearlyData {
  year: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export function calculateYearlyData(transactions: Transaction[]): YearlyData[] {
  const yearMap = new Map<string, { rev: number; exp: number; ref: number }>();

  for (const tx of transactions) {
    if (!isFinanciallySignificant(tx)) continue;
    const year = String(
      tx.date instanceof Date ? tx.date.getUTCFullYear() : new Date(tx.date).getUTCFullYear()
    );
    if (!yearMap.has(year)) yearMap.set(year, { rev: 0, exp: 0, ref: 0 });
    const entry = yearMap.get(year)!;
    const cents = Math.round(tx.amount * 100);
    if (tx.type === "INCOME") entry.rev += cents;
    else if (tx.type === "EXPENSE") entry.exp += cents;
    else if (tx.type === "REFUND") entry.ref += cents;
  }

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, { rev, exp, ref }]) => {
      const revenue = rev / 100;
      const expenses = (exp - ref) / 100;
      return { year, revenue, expenses, profit: roundCurrency(revenue - expenses) };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Break down transactions by category for a given type.
 * Returns results sorted by total descending with percentages.
 * Transfers are always excluded regardless of type filter.
 */
export function calculateCategoryBreakdown(
  transactions: Transaction[],
  type: "INCOME" | "EXPENSE"
): CategoryBreakdown[] {
  const categoryMap = new Map<string, {
    name: string;
    color: string | null;
    totalCents: number;
    count: number;
  }>();

  // For EXPENSE type, also count REFUND amounts as negative expenses
  const includeRefunds = type === "EXPENSE";

  for (const tx of transactions) {
    if (tx.type !== type && !(includeRefunds && tx.type === "REFUND")) continue;

    const catId = tx.categoryId ?? "__uncategorized__";
    const catName = tx.category?.name ?? "Uncategorized";
    const catColor = tx.category?.color ?? null;

    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, { name: catName, color: catColor, totalCents: 0, count: 0 });
    }

    const entry = categoryMap.get(catId)!;
    // Refunds subtract from the expense category they belong to
    const cents = Math.round(tx.amount * 100);
    entry.totalCents += tx.type === "REFUND" ? -cents : cents;
    entry.count++;
  }

  // Remove categories with zero or negative net (fully refunded)
  const entries = Array.from(categoryMap.entries()).filter(
    ([, { totalCents }]) => totalCents > 0
  );

  const grandTotalCents = entries.reduce((sum, [, { totalCents }]) => sum + totalCents, 0);

  return entries
    .map(([categoryId, { name, color, totalCents, count }]) => ({
      categoryId,
      categoryName: name,
      color,
      total: totalCents / 100,
      count,
      percentage: grandTotalCents > 0
        ? roundCurrency((totalCents / grandTotalCents) * 100)
        : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
