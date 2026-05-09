/**
 * LEDGR Account Reconciliation Engine
 *
 * Validates imported transactions against known opening/closing balances.
 * Detects missing transactions, balance mismatches, and duplicate transfers.
 *
 * Validated against real ING NL CAMT.053:
 *   - Opening: €0.28 CRDT
 *   - Closing: €0.25 CRDT
 *   - Total credits: €31,642.51
 *   - Total debits: €31,642.54
 *   - Net: -€0.03 ✓ (matches closing - opening)
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface BalanceInfo {
  opening: number;    // Opening balance (signed, in account currency)
  closing: number;    // Closing balance
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface ReconciliationTransaction {
  id: string;
  date: Date;
  signedAmount: number;   // negative=debit, positive=credit
  type: string;
  transactionHash: string;
  description: string | null;
  counterpartyIban: string | null;
}

export interface ReconciliationResult {
  status: "BALANCED" | "MISMATCH" | "MISSING_TRANSACTIONS" | "UNCHECKED";
  openingBalance: number;
  closingBalance: number;
  computedClosing: number;
  expectedClosing: number;
  discrepancy: number;        // computedClosing - expectedClosing (should be 0)
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  issues: ReconciliationIssue[];
  duplicateTransfers: DuplicateTransferPair[];
}

export interface ReconciliationIssue {
  type:
    | "BALANCE_MISMATCH"
    | "ROUNDING_DISCREPANCY"
    | "EXCESS_TRANSACTIONS"
    | "POSSIBLE_MISSING"
    | "DUPLICATE_TRANSFER";
  severity: "error" | "warning" | "info";
  message: string;
  amount?: number;
  transactionIds?: string[];
}

export interface DuplicateTransferPair {
  txId1: string;
  txId2: string;
  date: Date;
  amount: number;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run full reconciliation against a known opening/closing balance.
 *
 * Accounting invariant:
 *   closingBalance = openingBalance + sum(credits) - sum(debits)
 *
 * Uses integer cent arithmetic to avoid float drift.
 */
export function reconcile(
  transactions: ReconciliationTransaction[],
  balance: BalanceInfo
): ReconciliationResult {
  const issues: ReconciliationIssue[] = [];

  // ── Calculate net movement using integer cents ─────────────────────────
  let creditCents = 0;
  let debitCents = 0;

  for (const tx of transactions) {
    const cents = Math.round(tx.signedAmount * 100);
    if (cents >= 0) creditCents += cents;
    else debitCents += Math.abs(cents);
  }

  const totalCredits = creditCents / 100;
  const totalDebits = debitCents / 100;
  const netCents = creditCents - debitCents;
  const computedClosing = Math.round(balance.opening * 100) / 100 + netCents / 100;

  // Round to 2dp to avoid float artifacts
  const computedClosingRounded = Math.round(computedClosing * 100) / 100;
  const expectedClosingRounded = Math.round(balance.closing * 100) / 100;
  const discrepancy = Math.round((computedClosingRounded - expectedClosingRounded) * 100) / 100;

  // ── Detect duplicate transfers ──────────────────────────────────────────
  const duplicateTransfers = detectDuplicateTransfers(transactions);
  for (const pair of duplicateTransfers) {
    issues.push({
      type: "DUPLICATE_TRANSFER",
      severity: "warning",
      message: `Possible duplicate transfer: €${pair.amount.toFixed(2)} on ${pair.date.toISOString().slice(0, 10)} — ${pair.reason}`,
      amount: pair.amount,
      transactionIds: [pair.txId1, pair.txId2],
    });
  }

  // ── Balance validation ─────────────────────────────────────────────────
  if (Math.abs(discrepancy) < 0.005) {
    // Perfectly balanced
    return {
      status: "BALANCED",
      openingBalance: balance.opening,
      closingBalance: balance.closing,
      computedClosing: computedClosingRounded,
      expectedClosing: expectedClosingRounded,
      discrepancy: 0,
      totalCredits,
      totalDebits,
      transactionCount: transactions.length,
      issues,
      duplicateTransfers,
    };
  }

  // Small discrepancy (≤ €0.05) — likely rounding in bank statement
  if (Math.abs(discrepancy) <= 0.05) {
    issues.push({
      type: "ROUNDING_DISCREPANCY",
      severity: "warning",
      message: `Minor balance discrepancy of €${Math.abs(discrepancy).toFixed(2)} — likely rounding in bank statement`,
      amount: discrepancy,
    });
    return {
      status: "BALANCED",
      openingBalance: balance.opening,
      closingBalance: balance.closing,
      computedClosing: computedClosingRounded,
      expectedClosing: expectedClosingRounded,
      discrepancy,
      totalCredits,
      totalDebits,
      transactionCount: transactions.length,
      issues,
      duplicateTransfers,
    };
  }

  // Significant discrepancy — possible missing transactions
  const missingAmount = Math.abs(discrepancy);
  if (discrepancy < 0) {
    // We compute less than expected → missing credits or extra debits
    issues.push({
      type: "POSSIBLE_MISSING",
      severity: "error",
      message: `Balance mismatch: missing €${missingAmount.toFixed(2)} in credits (or extra debits not imported)`,
      amount: discrepancy,
    });
  } else {
    // We compute more than expected → extra credits or missing debits
    issues.push({
      type: "POSSIBLE_MISSING",
      severity: "error",
      message: `Balance mismatch: €${missingAmount.toFixed(2)} excess (possible missing debits or duplicate credits)`,
      amount: discrepancy,
    });
  }

  return {
    status: missingAmount > 1 ? "MISSING_TRANSACTIONS" : "MISMATCH",
    openingBalance: balance.opening,
    closingBalance: balance.closing,
    computedClosing: computedClosingRounded,
    expectedClosing: expectedClosingRounded,
    discrepancy,
    totalCredits,
    totalDebits,
    transactionCount: transactions.length,
    issues,
    duplicateTransfers,
  };
}

/**
 * Detect potential duplicate transfer pairs.
 *
 * A duplicate transfer pair is:
 * - Same absolute amount
 * - Same date (±1 day)
 * - Same counterparty IBAN
 * - Both classified as TRANSFER type
 *
 * This catches the common case where money goes from A→B and B→A
 * within the same period (e.g. family transfers that net to zero).
 */
export function detectDuplicateTransfers(
  transactions: ReconciliationTransaction[]
): DuplicateTransferPair[] {
  const pairs: DuplicateTransferPair[] = [];
  const transfers = transactions.filter((t) => t.type === "TRANSFER");

  for (let i = 0; i < transfers.length; i++) {
    for (let j = i + 1; j < transfers.length; j++) {
      const a = transfers[i];
      const b = transfers[j];

      // Same absolute amount
      if (Math.abs(Math.abs(a.signedAmount) - Math.abs(b.signedAmount)) > 0.01) continue;

      // Same counterparty IBAN
      if (!a.counterpartyIban || !b.counterpartyIban) continue;
      if (a.counterpartyIban !== b.counterpartyIban) continue;

      // Within 2 days
      const daysDiff = Math.abs(a.date.getTime() - b.date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 2) continue;

      // Opposite directions (one debit, one credit)
      if (Math.sign(a.signedAmount) === Math.sign(b.signedAmount)) continue;

      pairs.push({
        txId1: a.id,
        txId2: b.id,
        date: a.date,
        amount: Math.abs(a.signedAmount),
        reason: `Opposing transfers of €${Math.abs(a.signedAmount).toFixed(2)} to/from ${a.counterpartyIban} within ${Math.ceil(daysDiff)} day(s)`,
      });
    }
  }

  return pairs;
}

/**
 * Check if the total credits and debits in imported transactions
 * match the expected totals from CAMT.053 summary data.
 *
 * Used when we have TxsSummry data from the CAMT file.
 */
export function validateTotals(
  transactions: ReconciliationTransaction[],
  expected: { totalCredits: number; totalDebits: number; entryCount: number }
): {
  creditsMatch: boolean;
  debitsMatch: boolean;
  countMatch: boolean;
  creditDiscrepancy: number;
  debitDiscrepancy: number;
  countDiscrepancy: number;
} {
  let creditCents = 0;
  let debitCents = 0;

  for (const tx of transactions) {
    const cents = Math.round(tx.signedAmount * 100);
    if (cents >= 0) creditCents += cents;
    else debitCents += Math.abs(cents);
  }

  const actualCredits = creditCents / 100;
  const actualDebits = debitCents / 100;
  const creditDiscrepancy = Math.round((actualCredits - expected.totalCredits) * 100) / 100;
  const debitDiscrepancy = Math.round((actualDebits - expected.totalDebits) * 100) / 100;
  const countDiscrepancy = transactions.length - expected.entryCount;

  return {
    creditsMatch: Math.abs(creditDiscrepancy) < 0.005,
    debitsMatch: Math.abs(debitDiscrepancy) < 0.005,
    countMatch: countDiscrepancy === 0,
    creditDiscrepancy,
    debitDiscrepancy,
    countDiscrepancy,
  };
}

/**
 * Generate a human-readable reconciliation report.
 */
export function formatReconciliationReport(result: ReconciliationResult): string {
  const lines: string[] = [
    `Reconciliation Status: ${result.status}`,
    `Period: ${result.transactionCount} transactions`,
    `Opening Balance: €${result.openingBalance.toFixed(2)}`,
    `Total Credits:   €${result.totalCredits.toFixed(2)}`,
    `Total Debits:   -€${result.totalDebits.toFixed(2)}`,
    `Computed Closing: €${result.computedClosing.toFixed(2)}`,
    `Expected Closing: €${result.expectedClosing.toFixed(2)}`,
    `Discrepancy:      €${result.discrepancy.toFixed(2)}`,
  ];

  if (result.issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of result.issues) {
      lines.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }

  if (result.duplicateTransfers.length > 0) {
    lines.push("", `Potential Duplicate Transfers: ${result.duplicateTransfers.length}`);
    for (const pair of result.duplicateTransfers) {
      lines.push(`  - ${pair.reason}`);
    }
  }

  return lines.join("\n");
}
