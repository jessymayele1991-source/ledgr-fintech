/**
 * pain.001 Parser — ISO 20022 CustomerCreditTransferInitiation
 *
 * SEPA Credit Transfer (SCT) initiation file.
 * Used when businesses upload payment files to their bank.
 *
 * NOT a bank statement — this is an outgoing payment instruction.
 * Parsing extracts the individual credit transfers for display/audit.
 *
 * Structure:
 *   CstmrCdtTrfInitn
 *     GrpHdr          — Group Header (message ID, creation date, total amount)
 *     PmtInf[]        — Payment Information (one per batch)
 *       CdtTrfTxInf[] — Credit Transfer Transaction (one per payment)
 *
 * Validated against:
 *   - pain.001.001.09.xml (from ultimate_european_banking_specs_bundle)
 *   - pain.001.001.09Echtzeit.xml (instant payment variant)
 *
 * All amounts in pain.001 are ISO decimal (dot): "1234.56"
 * All dates are ISO 8601: "2025-01-15"
 */

import type { NormalizedTransaction } from "@/types";
import type { ImportRowError } from "./types";

export interface Pain001Statement {
  messageId: string | null;
  creationDateTime: string | null;
  numberOfTransactions: number;
  totalAmount: number;
  currency: string;
  debtorName: string | null;        // Ordering party
  debtorIban: string | null;
  debtorBic: string | null;
  transactions: NormalizedTransaction[];
  errors: ImportRowError[];
}

// ─────────────────────────────────────────────────────────────────────────────
// XML HELPERS (reuse same pattern as CAMT parser)
// ─────────────────────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<(?:[\\w]+:)?${tag}(?=[>\\s/])[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}(?=[>\\s])>`, "i");
  const match = pattern.exec(xml);
  return match ? match[1].trim() : null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<(?:[\\w]+:)?${tag}(?=[>\\s/])[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}(?=[>\\s])>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractAmountAttr(xml: string, tag: string): { amount: number; currency: string } | null {
  const pattern = new RegExp(`<(?:[\\w]+:)?${tag}(?=[>\\s/])[^>]*Ccy="([^"]+)"[^>]*>([\\d.]+)<\\/(?:[\\w]+:)?${tag}(?=[>\\s])>`, "i");
  const match = pattern.exec(xml);
  if (!match) return null;
  const amount = parseFloat(match[2]);
  return isNaN(amount) ? null : { amount, currency: match[1] };
}

function parseIsoDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  if (!match) return null;
  const d = new Date(match[1] + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parsePain001(xmlContent: string): Pain001Statement {
  const errors: ImportRowError[] = [];
  const transactions: NormalizedTransaction[] = [];

  const content = xmlContent.replace(/^\uFEFF/, "").trim();

  if (!content.includes("CstmrCdtTrfInitn") && !content.includes("pain.001")) {
    errors.push({
      row: 0, field: "format",
      message: "File does not appear to be a pain.001 credit transfer initiation",
      rawValue: content.slice(0, 100),
    });
    return { messageId: null, creationDateTime: null, numberOfTransactions: 0, totalAmount: 0, currency: "EUR", debtorName: null, debtorIban: null, debtorBic: null, transactions, errors };
  }

  const grpHdr = extractTag(content, "GrpHdr");
  const messageId = grpHdr ? extractTag(grpHdr, "MsgId") : null;
  const creationDateTime = grpHdr ? extractTag(grpHdr, "CreDtTm") : null;

  // Total control sum from group header
  const ctrlSumStr = grpHdr ? extractTag(grpHdr, "CtrlSum") : null;
  const totalAmount = ctrlSumStr ? parseFloat(ctrlSumStr) : 0;
  let currency = "EUR";

  // Debtor (ordering party) — from first PmtInf
  const firstPmtInf = extractTag(content, "PmtInf");
  let debtorName: string | null = null;
  let debtorIban: string | null = null;
  let debtorBic: string | null = null;

  if (firstPmtInf) {
    const dbtr = extractTag(firstPmtInf, "Dbtr");
    if (dbtr) debtorName = extractTag(dbtr, "Nm");

    const dbtrAcct = extractTag(firstPmtInf, "DbtrAcct");
    if (dbtrAcct) debtorIban = extractTag(dbtrAcct, "IBAN");

    const dbtrAgt = extractTag(firstPmtInf, "DbtrAgt");
    if (dbtrAgt) debtorBic = extractTag(extractTag(dbtrAgt, "FinInstnId") ?? "", "BIC");

    const ccy = extractTag(firstPmtInf, "Ccy");
    if (ccy && /^[A-Z]{3}$/.test(ccy)) currency = ccy;
  }

  // Parse all credit transfer transactions across all PmtInf blocks
  const pmtInfBlocks = extractAllTags(content, "PmtInf");
  let txIndex = 0;

  for (const pmtInf of pmtInfBlocks) {
    const pmtDt = extractTag(pmtInf, "ReqdExctnDt");
    // Check for nested date
    const requestedDate = parseIsoDate(
      pmtDt ? (extractTag(pmtDt, "Dt") ?? extractTag(pmtDt, "DtTm") ?? pmtDt) : null
    );

    const cdtTrfTxInfos = extractAllTags(pmtInf, "CdtTrfTxInf");

    for (const txInfo of cdtTrfTxInfos) {
      txIndex++;

      // Amount
      const amtResult = extractAmountAttr(txInfo, "InstdAmt") ?? extractAmountAttr(txInfo, "EqvtAmt");
      if (!amtResult) {
        errors.push({ row: txIndex, field: "amount", message: "Missing <InstdAmt> in pain.001 transaction", rawValue: "" });
        continue;
      }
      const { amount, currency: txCcy } = amtResult;

      // Date (from parent PmtInf or transaction-level)
      const txDate = requestedDate;
      if (!txDate) {
        errors.push({ row: txIndex, field: "date", message: "Cannot parse requested execution date", rawValue: pmtDt ?? "" });
        continue;
      }

      // Creditor (recipient)
      const cdtr = extractTag(txInfo, "Cdtr");
      const cdtrName = cdtr ? extractTag(cdtr, "Nm") : null;
      const cdtrAcct = extractTag(txInfo, "CdtrAcct");
      const cdtrIban = cdtrAcct ? extractTag(cdtrAcct, "IBAN") : null;

      // Remittance
      const rmtInf = extractTag(txInfo, "RmtInf");
      const description = rmtInf ? (extractTag(rmtInf, "Ustrd") ?? null) : null;

      // References
      const refs = extractTag(txInfo, "PmtId");
      const endToEndId = refs ? extractTag(refs, "EndToEndId") : null;
      const reference = endToEndId && endToEndId !== "NOTPROVIDED" ? endToEndId : null;

      // In pain.001, money flows OUT from debtor to creditor
      transactions.push({
        date: txDate,
        amount,
        signedAmount: -amount,  // Debit from ordering party's perspective
        currency: txCcy,
        description,
        reference,
        counterpartyName: cdtrName,
        counterpartyIban: cdtrIban,
        accountIban: debtorIban,
        rawData: {
          format: "pain001",
          debtorName,
          debtorBic,
          messageId,
        },
      });
    }
  }

  return {
    messageId,
    creationDateTime,
    numberOfTransactions: txIndex,
    totalAmount,
    currency,
    debtorName,
    debtorIban,
    debtorBic,
    transactions,
    errors,
  };
}

/**
 * Detect if XML content is a pain.001 file.
 */
export function isPain001(content: string): boolean {
  return (
    content.includes("CstmrCdtTrfInitn") ||
    content.includes("pain.001")
  );
}
