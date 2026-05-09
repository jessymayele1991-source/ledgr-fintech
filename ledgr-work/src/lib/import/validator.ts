/**
 * Transaction Validation Layer
 *
 * Runs after parsing, before saving.
 * Catches data quality problems that would corrupt accounting totals.
 */

import type { NormalizedTransaction } from "@/types";
import type { ImportRowError } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION RULES
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  row: number;
  field: string;
  code: ValidationCode;
  message: string;
  severity: ValidationSeverity;
  rawValue?: string;
}

export type ValidationCode =
  | "AMOUNT_ZERO"
  | "AMOUNT_OVERFLOW"
  | "AMOUNT_SUSPICIOUS"
  | "DATE_FUTURE"
  | "DATE_TOO_OLD"
  | "DATE_INVALID"
  | "IBAN_INVALID_FORMAT"
  | "IBAN_CHECKSUM_FAIL"
  | "CURRENCY_MISMATCH"
  | "DESCRIPTION_MISSING"
  | "POSSIBLE_DUPLICATE";

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const TODAY = new Date();
const MAX_FUTURE_DAYS = 7;          // Allow up to 7 days in future (value dates)
const MAX_PAST_YEARS = 20;          // Reject dates older than 20 years
const MAX_SINGLE_AMOUNT = 9_999_999.99;

function validateAmount(tx: NormalizedTransaction, row: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (tx.amount === 0) {
    issues.push({
      row, field: "amount", code: "AMOUNT_ZERO",
      message: "Amount is zero — this is unusual for a bank transaction.",
      severity: "warning",
    });
  }

  if (tx.amount > MAX_SINGLE_AMOUNT) {
    issues.push({
      row, field: "amount", code: "AMOUNT_OVERFLOW",
      message: `Amount €${tx.amount.toLocaleString("nl-NL")} exceeds maximum plausible value — possible misparse.`,
      severity: "error",
    });
  }

  // Check for suspiciously round large numbers that may be balance column
  if (tx.amount > 100_000 && tx.amount % 1000 === 0) {
    issues.push({
      row, field: "amount", code: "AMOUNT_SUSPICIOUS",
      message: `Amount €${tx.amount.toLocaleString("nl-NL")} is a very round large number — verify this is not a balance column.`,
      severity: "warning",
    });
  }

  return issues;
}

function validateDate(tx: NormalizedTransaction, row: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const futureLimit = new Date(TODAY);
  futureLimit.setDate(futureLimit.getDate() + MAX_FUTURE_DAYS);

  const pastLimit = new Date(TODAY);
  pastLimit.setFullYear(pastLimit.getFullYear() - MAX_PAST_YEARS);

  if (tx.date > futureLimit) {
    issues.push({
      row, field: "date", code: "DATE_FUTURE",
      message: `Date ${tx.date.toISOString().slice(0, 10)} is more than ${MAX_FUTURE_DAYS} days in the future.`,
      severity: "warning",
      rawValue: tx.date.toISOString(),
    });
  }

  if (tx.date < pastLimit) {
    issues.push({
      row, field: "date", code: "DATE_TOO_OLD",
      message: `Date ${tx.date.toISOString().slice(0, 10)} is more than ${MAX_PAST_YEARS} years ago — verify this is correct.`,
      severity: "warning",
      rawValue: tx.date.toISOString(),
    });
  }

  return issues;
}

function validateIban(tx: NormalizedTransaction, row: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!tx.counterpartyIban) return issues;

  const iban = tx.counterpartyIban.replace(/\s/g, "").toUpperCase();

  // Format check
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(iban)) {
    issues.push({
      row, field: "counterpartyIban", code: "IBAN_INVALID_FORMAT",
      message: `Counterparty IBAN "${iban}" has an invalid format.`,
      severity: "warning",
      rawValue: tx.counterpartyIban,
    });
    return issues;
  }

  // MOD97 checksum validation
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");

  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + parseInt(char, 10)) % 97;
  }

  if (remainder !== 1) {
    issues.push({
      row, field: "counterpartyIban", code: "IBAN_CHECKSUM_FAIL",
      message: `Counterparty IBAN "${iban}" failed MOD97 checksum — may be corrupted.`,
      severity: "warning",
      rawValue: tx.counterpartyIban,
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// DUPLICATE DETECTION (within current import batch)
// ─────────────────────────────────────────────────────────────────────────────

interface DupKey {
  dateStr: string;
  signedAmount: string;
  counterpartyIban: string;
  reference: string;
}

function makeDupKey(tx: NormalizedTransaction): string {
  const key: DupKey = {
    dateStr: tx.date.toISOString().slice(0, 10),
    signedAmount: tx.signedAmount.toFixed(4),
    counterpartyIban: (tx.counterpartyIban ?? "").replace(/\s/g, "").toUpperCase(),
    reference: (tx.reference ?? "").trim(),
  };
  return JSON.stringify(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

export function validateTransactionBatch(
  transactions: NormalizedTransaction[]
): {
  results: Array<{ transaction: NormalizedTransaction; issues: ValidationIssue[] }>;
  totalErrors: number;
  totalWarnings: number;
} {
  const seen = new Map<string, number>(); // dupKey → first row index
  let totalErrors = 0;
  let totalWarnings = 0;

  const results = transactions.map((tx, index) => {
    const row = index + 1;
    const issues: ValidationIssue[] = [];

    // Run validators
    issues.push(...validateAmount(tx, row));
    issues.push(...validateDate(tx, row));
    issues.push(...validateIban(tx, row));

    // Duplicate detection within batch
    const dupKey = makeDupKey(tx);
    const firstOccurrence = seen.get(dupKey);
    if (firstOccurrence !== undefined) {
      issues.push({
        row, field: "transaction", code: "POSSIBLE_DUPLICATE",
        message: `Possible duplicate of row ${firstOccurrence + 1} (same date, amount, IBAN, and reference).`,
        severity: "warning",
      });
    } else {
      seen.set(dupKey, index);
    }

    totalErrors += issues.filter((i) => i.severity === "error").length;
    totalWarnings += issues.filter((i) => i.severity === "warning").length;

    return { transaction: tx, issues };
  });

  return { results, totalErrors, totalWarnings };
}

/**
 * Filter out transactions with blocking errors.
 * Transactions with only warnings are kept.
 */
export function filterValidTransactions(
  validated: Array<{ transaction: NormalizedTransaction; issues: ValidationIssue[] }>
): NormalizedTransaction[] {
  return validated
    .filter(({ issues }) => !issues.some((i) => i.severity === "error"))
    .map(({ transaction }) => transaction);
}

/**
 * Convert ValidationIssues to ImportRowErrors for API compatibility.
 */
export function toImportRowErrors(
  validated: Array<{ transaction: NormalizedTransaction; issues: ValidationIssue[] }>
): ImportRowError[] {
  return validated.flatMap(({ issues }) =>
    issues.map((issue) => ({
      row: issue.row,
      field: issue.field,
      message: `[${issue.severity.toUpperCase()}] ${issue.message}`,
      rawValue: issue.rawValue ?? "",
    }))
  );
}
