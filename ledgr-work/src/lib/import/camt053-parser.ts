/**
 * CAMT.053 XML Parser
 *
 * ISO 20022 Bank-to-Customer Statement (camt.053.001.xx)
 * Used by: ING, ABN AMRO, Rabobank, BNP Paribas, Deutsche Bank, most EU banks
 *
 * Supports versions: .02, .06, .08
 */

import type { NormalizedTransaction } from "@/types";
import type { ImportRowError } from "./types";

export interface CamtStatement {
  accountIban: string | null;
  currency: string;
  openingBalance: number | null;
  closingBalance: number | null;
  statementId: string | null;
  transactions: NormalizedTransaction[];
  errors: ImportRowError[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE XML READER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal safe XML reader — avoids DOMParser dependency on server.
 * Uses regex-based extraction for known CAMT.053 tags.
 *
 * Note: This is intentionally not a generic XML parser — it targets the
 * specific CAMT.053 structure to remain fast and edge-case-safe.
 */
function extractTag(xml: string, tag: string): string | null {
  // Word-boundary after tag name: (?=[>\s/]) prevents "Cd" from matching "CdOrPrtry"
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

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const pattern = new RegExp(`<(?:[\\w]+:)?${tag}(?=[>\\s/])[^>]*${attr}="([^"]*)"`, "i");
  const match = pattern.exec(xml);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT PARSING
// ─────────────────────────────────────────────────────────────────────────────

function parseCamtAmount(xml: string, tag: string): { amount: number; currency: string } | null {
  // CAMT amounts: <Amt Ccy="EUR">1234.56</Amt>
  const pattern = new RegExp(`<(?:[\\w]+:)?${tag}(?=[>\\s/])[^>]*Ccy="([^"]+)"[^>]*>([\\d.]+)<\\/(?:[\\w]+:)?${tag}(?=[>\\s])>`, "i");
  const match = pattern.exec(xml);
  if (!match) return null;

  const amount = parseFloat(match[2]);
  if (isNaN(amount)) return null;

  return { amount, currency: match[1] };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE PARSING
// ─────────────────────────────────────────────────────────────────────────────

function parseCamtDate(raw: string | null): Date | null {
  if (!raw) return null;
  // ISO: 2024-01-15 or 2024-01-15T00:00:00
  const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  if (!dateMatch) return null;
  const d = new Date(dateMatch[1] + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseCamtEntry(entryXml: string, statementCurrency: string, index: number): {
  transaction: NormalizedTransaction | null;
  errors: ImportRowError[];
} {
  const errors: ImportRowError[] = [];

  // ── Amount ────────────────────────────────────────────────────────────
  const amtResult = parseCamtAmount(entryXml, "Amt");
  if (!amtResult) {
    errors.push({ row: index, field: "amount", message: "Missing or invalid <Amt>", rawValue: "" });
    return { transaction: null, errors };
  }
  const { amount, currency } = amtResult;

  // ── Credit/Debit indicator ────────────────────────────────────────────
  const cdIndicator = extractTag(entryXml, "CdtDbtInd");
  let signedAmount: number;
  if (cdIndicator === "CRDT") {
    signedAmount = amount;
  } else if (cdIndicator === "DBIT") {
    signedAmount = -amount;
  } else {
    errors.push({ row: index, field: "CdtDbtInd", message: `Unknown credit/debit indicator: "${cdIndicator}"`, rawValue: cdIndicator ?? "" });
    return { transaction: null, errors };
  }

  // ── Date ──────────────────────────────────────────────────────────────
  const rawDate = extractTag(entryXml, "BookgDt") ?? extractTag(entryXml, "ValDt");
  // CAMT dates can be wrapped in: <Dt>2024-01-15</Dt> or <DtTm>2024-01-15T...</DtTm>
  const dateStr = rawDate ? (extractTag(rawDate, "Dt") ?? extractTag(rawDate, "DtTm") ?? rawDate) : null;
  const date = parseCamtDate(dateStr);
  if (!date) {
    errors.push({ row: index, field: "date", message: `Cannot parse date: "${dateStr}"`, rawValue: dateStr ?? "" });
    return { transaction: null, errors };
  }

  // ── Description / Remittance ──────────────────────────────────────────
  const ntryDtls = extractTag(entryXml, "NtryDtls");
  let description: string | null = null;
  let reference: string | null = null;
  let counterpartyName: string | null = null;
  let counterpartyIban: string | null = null;

  if (ntryDtls) {
    // Unstructured remittance
    const ustrd = extractTag(ntryDtls, "Ustrd");
    description = ustrd;

    // Structured remittance reference
    const cdtRfAmt = extractTag(ntryDtls, "CdtrRefInf");
    if (cdtRfAmt) {
      reference = extractTag(cdtRfAmt, "Ref");
    }

    // End-to-end reference
    if (!reference) {
      reference = extractTag(ntryDtls, "EndToEndId");
    }

    // Counterparty — depends on direction
    const relatedParties = extractTag(ntryDtls, "RltdPties");
    if (relatedParties) {
      if (cdIndicator === "CRDT") {
        // We received money → counterparty is debtor
        const dbtr = extractTag(relatedParties, "Dbtr");
        if (dbtr) {
          counterpartyName = extractTag(dbtr, "Nm");
          const dbtrAcct = extractTag(relatedParties, "DbtrAcct");
          if (dbtrAcct) {
            const ibanEl = extractTag(dbtrAcct, "IBAN");
            counterpartyIban = ibanEl;
          }
        }
      } else {
        // We sent money → counterparty is creditor
        const cdtr = extractTag(relatedParties, "Cdtr");
        if (cdtr) {
          counterpartyName = extractTag(cdtr, "Nm");
          const cdtrAcct = extractTag(relatedParties, "CdtrAcct");
          if (cdtrAcct) {
            const ibanEl = extractTag(cdtrAcct, "IBAN");
            counterpartyIban = ibanEl;
          }
        }
      }
    }
  }

  // ── Bank transaction code (for fallback description) ──────────────────
  if (!description) {
    const prtry = extractTag(entryXml, "Prtry");
    if (prtry) {
      description = extractTag(prtry, "Cd");
    }
  }

  return {
    transaction: {
      date,
      amount,
      signedAmount,
      currency,
      description: description?.trim() || null,
      reference: reference?.trim() || null,
      counterpartyName: counterpartyName?.trim() || null,
      counterpartyIban: counterpartyIban?.trim() || null,
      accountIban: null, // set by caller
      rawData: { camtEntry: entryXml.slice(0, 500) }, // truncate for storage
    },
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parseCAMT053(xmlContent: string): CamtStatement {
  const errors: ImportRowError[] = [];
  const transactions: NormalizedTransaction[] = [];

  // Strip BOM if present
  const content = xmlContent.replace(/^\uFEFF/, "").trim();

  // Basic format validation
  if (!content.includes("BkToCstmrStmt") && !content.includes("Document")) {
    errors.push({
      row: 0,
      field: "format",
      message: "File does not appear to be a CAMT.053 statement",
      rawValue: content.slice(0, 100),
    });
    return { accountIban: null, currency: "EUR", openingBalance: null, closingBalance: null, statementId: null, transactions, errors };
  }

  // ── Statement metadata ────────────────────────────────────────────────
  const stmtBlock = extractTag(content, "Stmt");
  if (!stmtBlock) {
    errors.push({ row: 0, field: "format", message: "Cannot find <Stmt> block", rawValue: "" });
    return { accountIban: null, currency: "EUR", openingBalance: null, closingBalance: null, statementId: null, transactions, errors };
  }

  const statementId = extractTag(stmtBlock, "Id");

  // Account IBAN
  const acctBlock = extractTag(stmtBlock, "Acct");
  let accountIban: string | null = null;
  if (acctBlock) {
    accountIban = extractTag(acctBlock, "IBAN");
  }

  // Currency (from account or first transaction)
  let currency = "EUR";
  if (acctBlock) {
    const ccy = extractTag(acctBlock, "Ccy");
    if (ccy && /^[A-Z]{3}$/.test(ccy)) currency = ccy;
  }

  // Balances
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  const balBlocks = extractAllTags(stmtBlock, "Bal");

  for (const balXml of balBlocks) {
    const balType = extractTag(extractTag(balXml, "Tp") ?? "", "Cd") ??
                    extractTag(extractTag(balXml, "Tp") ?? "", "Prtry");
    const amtResult = parseCamtAmount(balXml, "Amt");
    const cdInd = extractTag(balXml, "CdtDbtInd");

    if (amtResult) {
      const signedBal = cdInd === "DBIT" ? -amtResult.amount : amtResult.amount;
      if (balType === "OPBD" || balType === "PRCD") openingBalance = signedBal;
      if (balType === "CLBD" || balType === "CLAV") closingBalance = signedBal;
    }
  }

  // ── Transactions ──────────────────────────────────────────────────────
  const entryBlocks = extractAllTags(stmtBlock, "Ntry");

  for (let i = 0; i < entryBlocks.length; i++) {
    const { transaction, errors: entryErrors } = parseCamtEntry(entryBlocks[i], currency, i + 1);
    errors.push(...entryErrors);

    if (transaction) {
      transaction.accountIban = accountIban;
      transactions.push(transaction);
    }
  }

  return {
    accountIban,
    currency,
    openingBalance,
    closingBalance,
    statementId,
    transactions,
    errors,
  };
}
