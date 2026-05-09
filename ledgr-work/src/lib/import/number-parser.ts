/**
 * LEDGR European Number Parser — v2
 *
 * Hardened against all known edge cases from Dutch/Belgian/German/French bank exports.
 *
 * Handles:
 *   44.576,07      → 44576.07   (NL/DE/BE format)
 *   44,576.07      → 44576.07   (US/UK format)
 *   -0,50          → -0.50
 *   (24,95)        → -24.95     (accounting negative)
 *   €1.245,55      → 1245.55
 *   1 234,56       → 1234.56    (FR space-separated thousands)
 *   1.234          → 1234       (NL thousands, no decimal)
 *   0.50           → 0.50       (plain decimal)
 *
 * Rejects:
 *   NL91INGB0001234567  (IBAN)
 *   REF-20240115-001    (reference)
 *   123456789012345678  (overflow / account number)
 */

/** Maximum plausible single transaction amount in EUR */
const MAX_PLAUSIBLE_AMOUNT = 9_999_999.99;

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "non_numeric" | "overflow" | "parse_failed" };

/**
 * Core parser — returns a discriminated union so callers can distinguish
 * failure reasons without catching exceptions.
 */
export function parseEuropeanNumberSafe(raw: string): ParseResult {
  if (!raw || typeof raw !== "string") return { ok: false, reason: "empty" };

  let s = raw.trim();
  if (!s) return { ok: false, reason: "empty" };

  // ── Step 1: accounting negative (24,95) → -24.95 ─────────────────────
  const isAccountingNegative = s.startsWith("(") && s.endsWith(")");
  if (isAccountingNegative) {
    s = "-" + s.slice(1, -1);
  }

  // ── Step 2: strip currency symbols and non-breaking spaces ───────────
  // Keep: digits, . , - + (already handled above)
  s = s
    .replace(/[€$£¥₹₽]/g, "")
    .replace(/\u00A0/g, " ")   // non-breaking space → regular space
    .replace(/\s/g, "")        // strip all whitespace (FR thousands: "1 234,56")
    .trim();

  if (!s || s === "-" || s === "+") return { ok: false, reason: "empty" };

  // ── Step 3: reject strings with letters (IBANs, refs) ────────────────
  // Exception: leading/trailing sign chars already handled
  if (/[A-Za-z]/.test(s)) return { ok: false, reason: "non_numeric" };

  // ── Step 3b: reject date strings — mid-string hyphens (e.g. 2025-10-30) ─
  // A leading minus is already stripped above; a hyphen inside the string
  // that is NOT a leading sign indicates a date or reference, not a number.
  if (/\d-\d/.test(s)) return { ok: false, reason: "non_numeric" };

  // ── Step 4: detect and reject obvious account numbers ────────────────
  // Pure digit strings longer than 10 digits are likely account numbers
  if (/^\d+$/.test(s) && s.length > 10) return { ok: false, reason: "overflow" };

  // ── Step 5: normalize sign ────────────────────────────────────────────
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (!s) return { ok: false, reason: "empty" };

  // ── Step 6: separate decimal part ────────────────────────────────────
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized: string;

  if (hasComma && hasDot) {
    // Both separators present
    const lastCommaIdx = s.lastIndexOf(",");
    const lastDotIdx = s.lastIndexOf(".");

    if (lastCommaIdx > lastDotIdx) {
      // European: 1.234,56 — dot=thousands, comma=decimal
      // Validate: after comma should be exactly 1-4 digits
      const afterComma = s.slice(lastCommaIdx + 1);
      if (afterComma.length > 4) return { ok: false, reason: "parse_failed" };
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Anglo: 1,234.56 — comma=thousands, dot=decimal
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const commaCount = (s.match(/,/g) ?? []).length;

    if (commaCount > 1) {
      // Multiple commas = thousands separator: "1,234,567"
      normalized = s.replace(/,/g, "");
    } else {
      const afterComma = s.slice(s.lastIndexOf(",") + 1);

      if (afterComma.length === 3) {
        // Ambiguous "1,234" — in European context, comma=thousands
        // (a decimal comma with 3 decimals would be unusual in banking)
        normalized = s.replace(",", "");
      } else {
        // "1234,56" or "0,50" — comma is decimal
        normalized = s.replace(",", ".");
      }
    }
  } else if (!hasComma && hasDot) {
    const dotCount = (s.match(/\./g) ?? []).length;

    if (dotCount > 1) {
      // Multiple dots = European thousands: "1.234.567"
      normalized = s.replace(/\./g, "");
    } else {
      const afterDot = s.slice(s.lastIndexOf(".") + 1);

      if (afterDot.length === 3) {
        // Ambiguous "1.234" — could be decimal or thousands
        // Heuristic: if integer part is empty or 1-3 digits → thousands
        const beforeDot = s.slice(0, s.lastIndexOf("."));
        if (beforeDot.length <= 3 && Number(beforeDot) < 1000) {
          // Likely "1.234" = 1234 (thousands) — but "0.234" = 0.234 (decimal)
          // If before-dot is 0, treat as decimal
          normalized = beforeDot === "0" ? s : s.replace(".", "");
        } else {
          normalized = s.replace(/\./g, "");
        }
      } else {
        // Standard decimal: "1234.56"
        normalized = s;
      }
    }
  } else {
    // No separators
    normalized = s;
  }

  // ── Step 7: final parse ───────────────────────────────────────────────
  if (!/^[\d.]+$/.test(normalized)) return { ok: false, reason: "parse_failed" };

  const value = parseFloat(normalized);
  if (isNaN(value)) return { ok: false, reason: "parse_failed" };

  const signed = sign * value;

  // ── Step 8: plausibility guard ────────────────────────────────────────
  if (Math.abs(signed) > MAX_PLAUSIBLE_AMOUNT) {
    return { ok: false, reason: "overflow" };
  }

  return { ok: true, value: signed };
}

/**
 * Convenience wrapper — returns number or null (backward-compatible).
 */
export function parseEuropeanNumber(raw: string): number | null {
  const result = parseEuropeanNumberSafe(raw);
  return result.ok ? result.value : null;
}

/**
 * Parse a debit/credit indicator column.
 * Returns +1 for credit (money coming in), -1 for debit (money going out).
 *
 * Covers Dutch, German, French, English, and MT940 conventions.
 */
export function parseCreditDebitIndicator(raw: string): number | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase().replace(/\s+/g, "");

  const CREDIT_TOKENS = new Set([
    // English
    "C", "CR", "CREDIT",
    // Dutch
    "BIJ", "CREDIT", "CREDITERING", "INC", "INKOMST", "ONTVANGEN",
    // German
    "HABEN", "GUT", "GUTSCHRIFT", "EINGANG",
    // French
    "CREDIT", "AVOIR",
    // Italian
    "AVERE", "ACCREDITARE", "ENTRATA",
    // Spanish
    "HABER", "ABONO", "INGRESO",
    // Portuguese
    "CREDITO", "CRÉDITO", "ENTRADA",
    // Accented variants (French: Crédit)
    "CRÉDIT",
    // MT940
    "C", "RC",   // RC = reversal credit
    // Signs
    "+",
  ]);

  const DEBIT_TOKENS = new Set([
    // English
    "D", "DR", "DEBIT",
    // Dutch
    "AF", "DEBET", "DEBITERING", "UIT", "BETAALD", "UITGAVE",
    // German
    "SOLL", "BELASTUNG", "LASTSCHRIFT", "AUSGANG",
    // French
    "DEBIT", "CHARGE",
    // Italian
    "DARE", "ADDEBITARE", "USCITA",
    // Spanish
    "DEBE", "CARGO", "GASTO",
    // Portuguese
    "DEBITO", "DÉBITO", "SAÍDA",
    // Accented variants (French: Débit, Crédit)
    "DÉBIT",
    // MT940
    "D", "RD",   // RD = reversal debit
    // Signs
    "-",
  ]);

  if (CREDIT_TOKENS.has(u)) return 1;
  if (DEBIT_TOKENS.has(u)) return -1;
  return null;
}

/**
 * Validate an IBAN with MOD97 checksum (not just format).
 */
export function validateIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();

  // Format check: 2 letters + 2 digits + 4-30 alphanum
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(iban)) return false;

  // MOD97 checksum
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");

  // Calculate MOD97 for large number string
  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + parseInt(char, 10)) % 97;
  }

  return remainder === 1;
}

/**
 * Normalize IBAN: uppercase + remove spaces.
 */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}
