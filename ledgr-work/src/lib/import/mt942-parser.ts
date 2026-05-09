/**
 * MT942 Parser — SWIFT Intraday Account Report
 *
 * MT942 is the intraday equivalent of MT940. Key differences:
 *  - :28C: may be absent or 00/0
 *  - :60F: is replaced by :60M: (intermediate opening)
 *  - :62F: is replaced by :62M: (intermediate closing)
 *  - Transactions are partial — more may follow during the day
 *  - Often has :34F: available balance field
 *
 * Otherwise structurally identical to MT940.
 * Strategy: normalize to MT940 format and re-use the MT940 parser.
 *
 * Validated against:
 *  - NL82INGB0004996760_01-05-2025_31-10-2025.940 (MT940, same bank)
 *  - Spec: SWIFT MX Standards MT940/MT942
 */

import { parseMT940 } from "./mt940-parser";
import type { MT940Statement } from "./mt940-parser";

export type MT942Statement = MT940Statement & {
  /** MT942 is always partial (intraday) */
  isIntraday: true;
};

/**
 * Parse an MT942 intraday statement.
 *
 * MT942-specific tag normalization:
 *   :60M: → :60F:  (intermediate opening → treat as opening)
 *   :62M: → :62F:  (intermediate closing → treat as closing)
 *   :34F: → skipped (available balance, not booking balance)
 *   :90C: → skipped (number/sum of credits — informational)
 *   :90D: → skipped (number/sum of debits — informational)
 */
export function parseMT942(content: string): MT942Statement {
  // Normalize MT942-specific tags to MT940 equivalents
  const normalized = content
    // :60M: and :60C: (intermediate balance) → treat as opening :60F:
    .replace(/^:60[MC]:/gm, ":60F:")
    // :62M: (intermediate closing) → treat as closing :62F:
    .replace(/^:62M:/gm, ":62F:")
    // :34F: available balance — skip (replace with a tag the parser ignores)
    .replace(/^:34F:.*$/gm, ":34F_SKIP:")
    // :90C:/:90D: credit/debit totals — skip
    .replace(/^:90[CD]:.*$/gm, "")
    // :28D: sequence number (MT942 variant of :28C:) — treat as :28C:
    .replace(/^:28D:/gm, ":28C:");

  const result = parseMT940(normalized);

  return {
    ...result,
    isIntraday: true,
  };
}

/**
 * Detect if content is MT942 vs MT940.
 * MT942 indicator: :34F: field or :90C:/:90D: fields.
 */
export function isMT942(content: string): boolean {
  return /^:34F:/m.test(content) || /^:90[CD]:/m.test(content);
}
