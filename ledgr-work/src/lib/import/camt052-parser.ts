/**
 * CAMT.052 Parser — ISO 20022 BankToCustomerAccountReport
 *
 * Intraday version of CAMT.053.
 * Root element: BkToCstmrAcctRpt → Rpt (vs Stmt in .053)
 *
 * Structurally identical to CAMT.053 except:
 *  - <BkToCstmrAcctRpt> instead of <BkToCstmrStmt>
 *  - <Rpt> instead of <Stmt>
 *  - Balances may be partial (intraday)
 *
 * Strategy: parse exactly like CAMT.053, just with different root/block names.
 */

import { parseCAMT053 } from "./camt053-parser";
import type { CamtStatement } from "./camt053-parser";
import type { ImportRowError } from "./types";

export type { CamtStatement };

/**
 * Parse CAMT.052 XML. Delegates to the CAMT.053 parser after
 * normalizing the root element names.
 */
export function parseCAMT052(xmlContent: string): CamtStatement {
  // Normalize .052 root tags to .053 equivalents so the .053 parser handles it
  const normalized = xmlContent
    // BkToCstmrAcctRpt → BkToCstmrStmt
    .replace(/<BkToCstmrAcctRpt/g, "<BkToCstmrStmt")
    .replace(/<\/BkToCstmrAcctRpt>/g, "</BkToCstmrStmt>")
    // Rpt → Stmt (intraday report → statement)
    .replace(/<Rpt>/g, "<Stmt>")
    .replace(/<\/Rpt>/g, "</Stmt>")
    // camt.052 namespace → camt.053 so format detection passes
    .replace(/camt\.052\./g, "camt.053.");

  const result = parseCAMT053(normalized);

  // Override any error message that says "camt.053" when input was .052
  const errors: ImportRowError[] = result.errors.map((e) =>
    e.message.includes("camt.053")
      ? { ...e, message: e.message.replace("CAMT.053", "CAMT.052") }
      : e
  );

  return { ...result, errors };
}

/**
 * Detect if XML content is a CAMT.052 file.
 */
export function isCAMT052(content: string): boolean {
  return (
    content.includes("BkToCstmrAcctRpt") ||
    content.includes("camt.052")
  );
}
