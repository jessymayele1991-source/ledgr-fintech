/**
 * LEDGR Locale-Specific Decimal Normalizer — Extended
 *
 * This extends the existing parseEuropeanNumber with locale-specific
 * handling validated against real banking files from this session's audit.
 *
 * Edge cases from real files:
 *   ING NL CSV:    "74,00"        → 74.00   (comma decimal, no thousands sep)
 *   ING NL MT940:  "46759,83"    → 46759.83 (comma, no thousands sep)
 *   ING NL MT940:  "1515,"       → 1515.00  (trailing comma = integer)
 *   ING NL CAMT:   "74.00"       → 74.00   (dot decimal - ISO XML standard)
 *   KBC BE CSV v1: "1 200,00"    → 1200.00  (space thousands, comma decimal)
 *   KBC BE CSV v2: "-3,23"       → -3.23    (signed, comma decimal)
 *   KBC BE CSV:    "2084,69"     → 2084.69  (saldo, comma decimal)
 *   DE CSV:        "1.234,56"    → 1234.56  (dot thousands, comma decimal)
 *   FR CSV:        "1 234,56"    → 1234.56  (space thousands, comma decimal)
 *   AU MT940:      "5000,00"     → 5000.00  (same as NL comma)
 *   US CSV:        "1,234.56"    → 1234.56  (comma thousands, dot decimal)
 *   Accounting:    "(24,95)"     → -24.95
 *   MT940 sign:    "853,08 +"    → 853.08
 *   MT940 sign:    "12,55 -"     → -12.55
 */

export type LocaleDecimalFormat =
  | "nl_be"     // 1.234,56 or 1234,56 — NL/BE/DE standard
  | "fr"        // 1 234,56 — French space thousands
  | "en"        // 1,234.56 — US/UK standard
  | "iso"       // 1234.56 — ISO/CAMT (no thousands)
  | "auto";     // Detect from content

export interface ParsedAmount {
  value: number;
  rawInput: string;
  format: LocaleDecimalFormat;
  wasNegated: boolean;       // Was the sign inverted (accounting parens, trailing -)
  hadTrailingComma: boolean; // MT940 edge case: "1515," = 1515.00
}

/**
 * Parse an amount string with explicit locale format.
 * Returns a full ParsedAmount with metadata, or null on failure.
 *
 * Priority:
 * 1. Handle sign prefix/suffix (-, +, accounting parens)
 * 2. Apply locale-specific thousand/decimal separator rules
 * 3. Validate the result is a plausible transaction amount
 */
export function parseAmountWithLocale(
  raw: string,
  format: LocaleDecimalFormat = "auto"
): ParsedAmount | null {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();
  if (!s) return null;

  // ── Step 1: Handle accounting negatives (24,95) → -24.95 ────────────────
  const isAccountingNeg = s.startsWith("(") && s.endsWith(")");
  if (isAccountingNeg) s = "-" + s.slice(1, -1).trim();

  // ── Step 2: Handle trailing sign "853,08 +" or "12,55 -" (KBC PDF) ──────
  let trailingSign = 1;
  const trailingPlusMatch = /^(.+?)\s*\+\s*$/.exec(s);
  const trailingMinusMatch = /^(.+?)\s*-\s*$/.exec(s);
  if (trailingPlusMatch) { s = trailingPlusMatch[1].trim(); }
  else if (trailingMinusMatch) { s = trailingMinusMatch[1].trim(); trailingSign = -1; }

  // ── Step 3: Handle leading sign ─────────────────────────────────────────
  let leadSign = 1;
  if (s.startsWith("-")) { leadSign = -1; s = s.slice(1).trim(); }
  else if (s.startsWith("+")) { s = s.slice(1).trim(); }

  const sign = leadSign * trailingSign;
  const wasNegated = sign === -1 || isAccountingNeg;

  // ── Step 4: Strip currency symbols ──────────────────────────────────────
  s = s.replace(/[€$£¥₹₽]/g, "").replace(/\u00A0/g, " ").trim();

  if (!s || !s.match(/[\d]/)) return null;

  // ── Step 5: Handle trailing comma (MT940 edge case: "1515," = 1515.00) ──
  const hadTrailingComma = s.endsWith(",");
  if (hadTrailingComma) s = s.slice(0, -1);

  // ── Step 6: Apply locale rules ───────────────────────────────────────────
  const detectedFormat = format === "auto" ? detectFormat(s) : format;
  const normalized = normalizeByFormat(s, detectedFormat);
  if (normalized === null) return null;

  const value = parseFloat(normalized);
  if (isNaN(value)) return null;
  if (!isFinite(value)) return null;
  if (Math.abs(value) > 9_999_999.99) return null;  // Overflow guard

  return {
    value: Math.round(value * sign * 10000) / 10000,  // 4dp precision, preserve sign
    rawInput: raw,
    format: detectedFormat,
    wasNegated,
    hadTrailingComma,
  };
}

/**
 * Auto-detect decimal format from content analysis.
 */
function detectFormat(s: string): LocaleDecimalFormat {
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  const hasSpace = s.includes(" ");

  if (!hasComma && !hasDot) return "iso";  // Pure integer

  if (hasSpace && hasComma && !hasDot) {
    // "1 234,56" or "1 200,00" → French/BE format
    return "fr";
  }

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");

    if (lastDot > lastComma) {
      // "1,234.56" → US/UK format
      return "en";
    } else {
      // "1.234,56" → NL/BE/DE format
      return "nl_be";
    }
  }

  if (hasComma && !hasDot) {
    // Could be "74,00" (NL decimal) or "1,234" (US thousands)
    const afterComma = s.split(",").pop() ?? "";
    if (afterComma.length === 3 && !afterComma.includes(".")) {
      // Ambiguous: "1,234" — assume NL/BE decimal if afterComma has non-zero cents
      // But "1,000" could be either. Default to NL/BE (comma decimal)
      return "nl_be";
    }
    return "nl_be";  // "74,00" — NL/BE standard
  }

  if (hasDot && !hasComma) {
    const afterDot = s.split(".").pop() ?? "";
    if (afterDot.length === 3) {
      // "1.000" — could be NL/DE thousands. Treat as integer.
      return "nl_be";
    }
    return "iso";  // "74.00" — ISO/CAMT dot decimal
  }

  return "auto";
}

/**
 * Convert a detected-format amount string to a plain float string.
 */
function normalizeByFormat(s: string, format: LocaleDecimalFormat): string | null {
  switch (format) {
    case "nl_be":
    case "fr": {
      // Remove all spaces (thousands or French space separator)
      // Remove dots used as thousands separators
      // Replace comma with dot for decimal
      const cleaned = s
        .replace(/\s/g, "")      // "1 200,00" → "1200,00"
        .replace(/\./g, "")      // "1.234,56" → "1234,56"
        .replace(",", ".");      // "1234,56" → "1234.56"
      return cleaned || null;
    }

    case "en": {
      // Remove commas used as thousands separators
      const cleaned = s.replace(/,/g, "");  // "1,234.56" → "1234.56"
      return cleaned || null;
    }

    case "iso":
    case "auto":
    default: {
      // Already standard float format: "1234.56" or "1234"
      return s || null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCALE DETECTION FROM CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the decimal format of a file based on header language and sample amounts.
 * Used by the column detector to pre-configure the parser.
 */
export function detectDecimalFormat(
  sampleAmounts: string[],
  detectedLanguage?: string
): LocaleDecimalFormat {
  const samples = sampleAmounts.filter(Boolean).slice(0, 20);
  if (samples.length === 0) return "auto";

  // Count format indicators
  let nlCount = 0, enCount = 0, frCount = 0, isoCount = 0;

  for (const s of samples) {
    const clean = s.replace(/[€$£\-\+\(\)]/g, "").trim();
    if (!clean) continue;

    const hasSpace = /\s/.test(clean);
    const commaCount = (clean.match(/,/g) ?? []).length;
    const dotCount = (clean.match(/\./g) ?? []).length;
    const lastComma = clean.lastIndexOf(",");
    const lastDot = clean.lastIndexOf(".");

    if (hasSpace && commaCount > 0 && dotCount === 0) {
      frCount++;  // "1 200,00"
    } else if (commaCount > 0 && dotCount > 0) {
      if (lastDot > lastComma) enCount++;   // "1,234.56"
      else nlCount++;                        // "1.234,56"
    } else if (commaCount > 0 && dotCount === 0) {
      nlCount++;  // "74,00" — NL/BE/DE
    } else if (dotCount > 0 && commaCount === 0) {
      isoCount++;  // "74.00" — ISO
    }
  }

  const max = Math.max(nlCount, enCount, frCount, isoCount);
  if (max === 0) return "auto";

  if (nlCount === max) return "nl_be";
  if (frCount === max) return "fr";
  if (enCount === max) return "en";
  return "iso";
}

/**
 * Convenience: parse an amount using auto-detection.
 * Returns the numeric value or null.
 */
export function parseAmount(raw: string, format: LocaleDecimalFormat = "auto"): number | null {
  const result = parseAmountWithLocale(raw, format);
  return result ? result.value : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCALE-SPECIFIC FORMAT EXAMPLES (for documentation / tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known decimal format by bank/country, validated from real files.
 */
export const LOCALE_FORMAT_BY_BANK: Record<string, LocaleDecimalFormat> = {
  // NL banks
  "ing-nl-csv":       "nl_be",   // "74,00"
  "ing-nl-mt940":     "nl_be",   // "74,00" (MT940 always comma NL)
  "ing-nl-camt053":   "iso",     // "74.00" (CAMT XML standard)
  "rabobank-csv":     "iso",     // "1234.56" (Rabobank uses dot)
  "abnamro-csv":      "nl_be",   // "74,00"
  "bunq-csv":         "iso",     // "74.00" (English format)
  "triodos-csv":      "iso",     // "74.00"

  // BE banks
  "kbc-be-csv":       "nl_be",   // "-3,23" (signed, comma decimal)
  "kbc-be-pdf":       "nl_be",   // "1 200,00" (space thousands — auto-detected as fr)
  "belfius-csv":      "nl_be",   // "1.234,56"

  // DE banks
  "deutschebank-csv": "nl_be",   // "1.234,56" (dot thousands, comma decimal)
  "sparkasse-csv":    "nl_be",   // "1.234,56"

  // FR banks
  "bnp-fr-csv":       "fr",      // "1 234,56" (space thousands)

  // UK/AU/US banks
  "revolut-csv":      "iso",     // "1234.56"
  "barclays-csv":     "en",      // "1,234.56"
  "us-csv":           "en",      // "1,234.56"

  // Wire/SWIFT
  "camt053":          "iso",     // Always ISO dot decimal
  "mt940":            "nl_be",   // Generally comma decimal (European)
};
