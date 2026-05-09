/**
 * SEPA XML Parser — Generic handler for SEPA message types
 *
 * Covers:
 *   pain.002  — CustomerPaymentStatusReport (credit transfer status)
 *   pain.007  — CustomerPaymentReversal (mandate cancellation)
 *   pain.008  — CustomerDirectDebitInitiation (direct debit batch)
 *
 * Validated against (from ultimate_european_banking_specs_bundle):
 *   pain.002.001.10-VOP Status Report.xml
 *   pain.002.001.10_PSR_SCT-Sammler_positiv_und-rejects.xml
 *   pain.002.001.10_PSR_SDD-Sammler_nur_rejects.xml
 *   pain.007.001.09_Storno_eine_Tx_aus_SDD-Sammler.xml
 *   pain.008.001.08.xml
 *
 * Design: These files are NOT statements — they are SEPA protocol messages.
 * We extract any implied transactions for display and auditing.
 * For pain.002: extract rejected transactions (negative amounts) and accepted credits.
 * For pain.007: extract reversal amounts (debit reversals).
 * For pain.008: extract direct debit mandates and amounts.
 */

import type { NormalizedTransaction } from "@/types";
import type { ImportRowError } from "./types";

export type SepaXmlType =
  | "pain.002"   // Payment Status Report
  | "pain.007"   // Payment Reversal
  | "pain.008"   // Direct Debit Initiation
  | "unknown";

export interface SepaXmlResult {
  type: SepaXmlType;
  messageId: string | null;
  creationDateTime: string | null;
  transactions: NormalizedTransaction[];
  errors: ImportRowError[];
  rawSummary: {
    acceptedCount: number;
    rejectedCount: number;
    totalAccepted: number;
    totalRejected: number;
    currency: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// XML HELPERS
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
// TYPE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectSepaXmlType(content: string): SepaXmlType {
  if (content.includes("CstmrPmtStsRpt") || content.includes("pain.002")) return "pain.002";
  if (content.includes("CstmrPmtRvsl") || content.includes("pain.007")) return "pain.007";
  if (content.includes("CstmrDrctDbtInitn") || content.includes("pain.008")) return "pain.008";
  return "unknown";
}

export function isSepaXml(content: string): boolean {
  return detectSepaXmlType(content) !== "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// PAIN.002 — Payment Status Report
// ─────────────────────────────────────────────────────────────────────────────

function parsePain002(content: string, errors: ImportRowError[]): {
  transactions: NormalizedTransaction[];
  summary: SepaXmlResult["rawSummary"];
} {
  const transactions: NormalizedTransaction[] = [];
  let acceptedCount = 0, rejectedCount = 0;
  let totalAccepted = 0, totalRejected = 0;
  let currency = "EUR";
  let txIndex = 0;

  // pain.002 contains TxInfAndSts (Transaction Information and Status) blocks
  const txBlocks = extractAllTags(content, "TxInfAndSts");

  for (const txBlock of txBlocks) {
    txIndex++;
    const status = extractTag(txBlock, "TxSts");
    const reason = extractTag(extractTag(txBlock, "StsRsnInf") ?? "", "Cd");
    const amtResult = extractAmountAttr(txBlock, "InstdAmt") ?? extractAmountAttr(txBlock, "EqvtAmt");
    const dateStr = extractTag(txBlock, "AccptncDtTm");
    const date = parseIsoDate(dateStr) ?? new Date();

    // Creditor info from original transaction
    const cdtr = extractTag(txBlock, "Cdtr");
    const cdtrName = cdtr ? extractTag(cdtr, "Nm") : null;
    const cdtrAcct = extractTag(txBlock, "CdtrAcct");
    const cdtrIban = cdtrAcct ? extractTag(cdtrAcct, "IBAN") : null;

    const endToEndId = extractTag(extractTag(txBlock, "OrgnlEndToEndId") ?? txBlock, "EndToEndId");

    if (!amtResult) continue;
    const { amount } = amtResult;
    currency = amtResult.currency;

    const isRejected = status === "RJCT" || !!reason;

    if (isRejected) {
      rejectedCount++;
      totalRejected += amount;
    } else {
      acceptedCount++;
      totalAccepted += amount;
    }

    transactions.push({
      date,
      amount,
      signedAmount: isRejected ? 0 : -amount,  // Rejected = no movement
      currency,
      description: isRejected
        ? `SEPA Payment Rejected: ${reason ?? "RJCT"}`
        : `SEPA Payment Status: ${status ?? "ACCP"}`,
      reference: endToEndId,
      counterpartyName: cdtrName,
      counterpartyIban: cdtrIban,
      accountIban: null,
      rawData: {
        format: "pain002",
        status,
        rejectionReason: reason,
        isRejected,
      },
    });
  }

  return {
    transactions,
    summary: { acceptedCount, rejectedCount, totalAccepted, totalRejected, currency },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAIN.007 — Payment Reversal
// ─────────────────────────────────────────────────────────────────────────────

function parsePain007(content: string, errors: ImportRowError[]): {
  transactions: NormalizedTransaction[];
  summary: SepaXmlResult["rawSummary"];
} {
  const transactions: NormalizedTransaction[] = [];
  let currency = "EUR";
  let txIndex = 0;

  // pain.007 has TxInf (Transaction Information) blocks with reversal details
  const txBlocks = extractAllTags(content, "TxInf");

  for (const txBlock of txBlocks) {
    txIndex++;
    const amtResult = extractAmountAttr(txBlock, "InstrAmt") ?? extractAmountAttr(txBlock, "InstdAmt");
    const dateStr = extractTag(extractTag(txBlock, "OrgnlPmtInfAndRvsl") ?? "", "ReqdColltnDt");
    const date = parseIsoDate(dateStr) ?? new Date();

    const cdtr = extractTag(txBlock, "Cdtr");
    const cdtrName = cdtr ? extractTag(cdtr, "Nm") : null;
    const endToEndId = extractTag(txBlock, "OrgnlEndToEndId");
    const reason = extractTag(extractTag(txBlock, "RvslRsnInf") ?? "", "Cd");

    if (!amtResult) continue;
    const { amount } = amtResult;
    currency = amtResult.currency;

    transactions.push({
      date,
      amount,
      signedAmount: amount,  // Reversal = money coming back = credit
      currency,
      description: `SEPA Payment Reversal${reason ? `: ${reason}` : ""}`,
      reference: endToEndId,
      counterpartyName: cdtrName,
      counterpartyIban: null,
      accountIban: null,
      rawData: {
        format: "pain007",
        reversalReason: reason,
        isReturn: true,
      },
    });
  }

  return {
    transactions,
    summary: { acceptedCount: 0, rejectedCount: 0, totalAccepted: 0, totalRejected: 0, currency },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAIN.008 — Direct Debit Initiation
// ─────────────────────────────────────────────────────────────────────────────

function parsePain008(content: string, errors: ImportRowError[]): {
  transactions: NormalizedTransaction[];
  summary: SepaXmlResult["rawSummary"];
} {
  const transactions: NormalizedTransaction[] = [];
  let currency = "EUR";
  let txIndex = 0;
  let totalDebit = 0;

  const pmtInfBlocks = extractAllTags(content, "PmtInf");

  for (const pmtInf of pmtInfBlocks) {
    const dateStr = extractTag(pmtInf, "ReqdColltnDt");
    const requestedDate = parseIsoDate(dateStr);
    const cdtrName = extractTag(extractTag(pmtInf, "Cdtr") ?? "", "Nm");

    const ddTxInfos = extractAllTags(pmtInf, "DrctDbtTxInf");

    for (const txInfo of ddTxInfos) {
      txIndex++;
      const amtResult = extractAmountAttr(txInfo, "InstdAmt");
      if (!amtResult) continue;

      const { amount } = amtResult;
      currency = amtResult.currency;
      totalDebit += amount;

      const date = requestedDate ?? new Date();
      const dbtr = extractTag(txInfo, "Dbtr");
      const dbtrName = dbtr ? extractTag(dbtr, "Nm") : null;
      const dbtrAcct = extractTag(txInfo, "DbtrAcct");
      const dbtrIban = dbtrAcct ? extractTag(dbtrAcct, "IBAN") : null;
      const mndtId = extractTag(extractTag(txInfo, "DrctDbtTx") ?? "", "MndtId");
      const endToEndId = extractTag(extractTag(txInfo, "PmtId") ?? "", "EndToEndId");
      const rmtInf = extractTag(txInfo, "RmtInf");
      const description = rmtInf ? extractTag(rmtInf, "Ustrd") : null;

      transactions.push({
        date,
        amount,
        signedAmount: -amount,  // Debit collection
        currency,
        description: description ?? `SEPA Direct Debit${mndtId ? ` (mandate: ${mndtId})` : ""}`,
        reference: endToEndId ?? mndtId,
        counterpartyName: dbtrName ?? cdtrName,
        counterpartyIban: dbtrIban,
        accountIban: null,
        rawData: {
          format: "pain008",
          mandateId: mndtId,
          creditorName: cdtrName,
        },
      });
    }
  }

  return {
    transactions,
    summary: { acceptedCount: txIndex, rejectedCount: 0, totalAccepted: 0, totalRejected: totalDebit, currency },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export function parseSepaXml(xmlContent: string): SepaXmlResult {
  const errors: ImportRowError[] = [];
  const content = xmlContent.replace(/^\uFEFF/, "").trim();

  const type = detectSepaXmlType(content);

  if (type === "unknown") {
    errors.push({
      row: 0, field: "format",
      message: "File does not appear to be a supported SEPA XML type (pain.002, pain.007, or pain.008)",
      rawValue: content.slice(0, 100),
    });
    return {
      type,
      messageId: null,
      creationDateTime: null,
      transactions: [],
      errors,
      rawSummary: { acceptedCount: 0, rejectedCount: 0, totalAccepted: 0, totalRejected: 0, currency: "EUR" },
    };
  }

  const grpHdr = extractTag(content, "GrpHdr");
  const messageId = grpHdr ? extractTag(grpHdr, "MsgId") : null;
  const creationDateTime = grpHdr ? extractTag(grpHdr, "CreDtTm") : null;

  let transactions: NormalizedTransaction[] = [];
  let summary: SepaXmlResult["rawSummary"] = { acceptedCount: 0, rejectedCount: 0, totalAccepted: 0, totalRejected: 0, currency: "EUR" };

  switch (type) {
    case "pain.002": {
      const result = parsePain002(content, errors);
      transactions = result.transactions;
      summary = result.summary;
      break;
    }
    case "pain.007": {
      const result = parsePain007(content, errors);
      transactions = result.transactions;
      summary = result.summary;
      break;
    }
    case "pain.008": {
      const result = parsePain008(content, errors);
      transactions = result.transactions;
      summary = result.summary;
      break;
    }
  }

  return { type, messageId, creationDateTime, transactions, errors, rawSummary: summary };
}
