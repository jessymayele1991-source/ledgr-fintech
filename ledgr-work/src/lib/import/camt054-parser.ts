/**
 * CAMT.054 Parser — ISO 20022 BankToCustomerDebitCreditNotification
 *
 * Used for immediate debit/credit notifications (Notificatie in NL).
 * Structurally similar to CAMT.053/052 but:
 *  - Root: BkToCstmrDbtCdtNtfctn
 *  - Block: Ntfctn (notification)
 *  - Balances: usually absent or opening-only
 *  - Can contain multiple account notifications in one file
 *
 * Real-world use: ING sends these for high-value instant payments.
 */

import { parseCAMT053 } from "./camt053-parser";
import type { CamtStatement } from "./camt053-parser";
import type { ImportRowError } from "./types";

export type { CamtStatement };

/**
 * Parse CAMT.054 XML.
 * Normalizes root element names to .053 equivalents and delegates.
 */
export function parseCAMT054(xmlContent: string): CamtStatement {
  const normalized = xmlContent
    .replace(/<BkToCstmrDbtCdtNtfctn/g, "<BkToCstmrStmt")
    .replace(/<\/BkToCstmrDbtCdtNtfctn>/g, "</BkToCstmrStmt>")
    .replace(/<Ntfctn>/g, "<Stmt>")
    .replace(/<\/Ntfctn>/g, "</Stmt>")
    .replace(/camt\.054\./g, "camt.053.");

  const result = parseCAMT053(normalized);

  const errors: ImportRowError[] = result.errors.map((e) =>
    e.message.includes("camt.053")
      ? { ...e, message: e.message.replace("CAMT.053", "CAMT.054") }
      : e
  );

  return { ...result, errors };
}

/**
 * Detect if XML content is a CAMT.054 file.
 */
export function isCAMT054(content: string): boolean {
  return (
    content.includes("BkToCstmrDbtCdtNtfctn") ||
    content.includes("camt.054")
  );
}
