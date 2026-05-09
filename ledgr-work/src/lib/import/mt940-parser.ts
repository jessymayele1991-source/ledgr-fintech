/**
 * MT940 Parser — SWIFT bank statement format
 *
 * Used by: ING, ABN AMRO, Rabobank, Deutsche Bank, Commerzbank, BNP Paribas, etc.
 *
 * MT940 structure:
 *   :20:  Transaction reference
 *   :25:  Account identification
 *   :28C: Statement number
 *   :60F: Opening balance
 *   :61:  Statement line (transaction)
 *   :86:  Information to account owner (description)
 *   :62F: Closing balance
 */

import { parseEuropeanNumber, parseCreditDebitIndicator, normalizeIban } from "./number-parser";
import type { NormalizedTransaction } from "@/types";
import type { ImportRowError } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MT940Statement {
  reference: string;
  accountIban: string | null;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  transactions: NormalizedTransaction[];
  errors: ImportRowError[];
}

interface MT940RawTransaction {
  lineIndex: number;
  line61: string;
  line86: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MT940 DATE PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MT940 dates are YYMMDD format, optionally followed by MMDD for value date.
 * Example: 240115 → 2024-01-15
 */
function parseMT940Date(raw: string): Date | null {
  const clean = raw.trim().slice(0, 6);
  if (!/^\d{6}$/.test(clean)) return null;

  const yy = parseInt(clean.slice(0, 2), 10);
  const mm = parseInt(clean.slice(2, 4), 10);
  const dd = parseInt(clean.slice(4, 6), 10);

  // Y2K heuristic: 00-29 → 2000-2029, 30-99 → 1930-1999
  const year = yy <= 29 ? 2000 + yy : 1900 + yy;

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const d = new Date(Date.UTC(year, mm - 1, dd));
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────────────────────────────────────
// MT940 AMOUNT PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MT940 amounts use comma as decimal separator: 1234,56
 * The sign is given by a separate C/D indicator character.
 */
function parseMT940Amount(raw: string): number | null {
  const normalized = raw.replace(",", ".");
  const value = parseFloat(normalized);
  return isNaN(value) ? null : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// :61: LINE PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a :61: statement line.
 *
 * Format: YYMMDD[MMDD]<C|D|RC|RD><Amount><FundsCode><Reference>[//<BankRef>]
 *
 * Examples:
 *   2401150115D1234,56NNONREF//ABC123
 *   240115C500,00NTRFREF-001
 */
interface Parsed61 {
  date: Date | null;
  valueDate: Date | null;
  creditDebit: number;  // +1 or -1
  amount: number | null;
  reference: string;
  bankReference: string | null;
}

function parse61Line(line: string): Parsed61 | null {
  // Minimum length check
  if (line.length < 10) return null;

  let pos = 0;

  // Date: YYMMDD (6 chars)
  const date = parseMT940Date(line.slice(pos, pos + 6));
  pos += 6;

  // Optional value date: MMDD (4 chars, if next 4 chars are digits)
  let valueDate: Date | null = null;
  if (/^\d{4}/.test(line.slice(pos, pos + 4)) && !/^[CD]/.test(line.slice(pos, pos + 1))) {
    // Looks like MMDD, not CD indicator
    pos += 4;
  }

  // C/D indicator (possibly 2 chars: RC or RD)
  let cdIndicator: number;
  if (line.slice(pos, pos + 2) === "RC") {
    cdIndicator = 1;
    pos += 2;
  } else if (line.slice(pos, pos + 2) === "RD") {
    cdIndicator = -1;
    pos += 2;
  } else if (line[pos] === "C") {
    cdIndicator = 1;
    pos += 1;
  } else if (line[pos] === "D") {
    cdIndicator = -1;
    pos += 1;
  } else {
    return null; // Cannot determine direction
  }

  // Amount: digits and comma until non-digit/non-comma
  const amountMatch = line.slice(pos).match(/^[\d,]+/);
  if (!amountMatch) return null;
  const amount = parseMT940Amount(amountMatch[0]);
  pos += amountMatch[0].length;

  // Funds code (1 char, usually "N")
  if (pos < line.length && /[A-Z]/.test(line[pos])) pos += 1;

  // Reference: up to // or end of line
  const rest = line.slice(pos);
  const doubleSlash = rest.indexOf("//");
  let reference: string;
  let bankReference: string | null = null;

  if (doubleSlash !== -1) {
    reference = rest.slice(0, doubleSlash).trim();
    bankReference = rest.slice(doubleSlash + 2).trim() || null;
  } else {
    reference = rest.trim();
  }

  // Strip NONREF placeholder
  if (reference === "NONREF") reference = "";

  return {
    date,
    valueDate,
    creditDebit: cdIndicator,
    amount,
    reference: reference || "",
    bankReference,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// :86: DESCRIPTION PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the :86: information to account owner line.
 *
 * ING NL MT940 sub-field structure (validated against real ING files):
 *   /CNTP/ — counterparty: IBAN/BIC/Name (3 slash-separated fields)
 *   /TRCD/ — transaction code (00370=book, 00100=credit, 01018=direct debit, 09001=fee)
 *   /RTRN/ — return reason code (MD06=refund on request, MS02=mandate cancelled)
 *   /REMI/ — remittance information (description)
 *   /EREF/ — end-to-end reference
 *   /MARF/ — mandate reference
 *   /CSID/ — creditor scheme ID
 *   /ULTD/ — ultimate debtor name
 *
 * CRITICAL: /CNTP/ has format: IBAN_OR_ID/BIC/Name
 *   e.g. /CNTP/BE29736055775064/KREDBEBB/Joyce mulders//
 *   e.g. /CNTP/D85909804/INGBNL2A/Zakelijke Oranje Spaarrekening// (NOT a real IBAN!)
 */
interface Parsed86 {
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  counterpartyInternalId: string | null;
  reference: string | null;
  trcdCode: string | null;
  isReturn: boolean;
  returnReasonCode: string | null;
  isSpaarrekening: boolean;
}

function parseCNTP(content: string): { iban: string | null; internalId: string | null; name: string | null } {
  const match = /\/CNTP\/([^/]*)\/?([^/]*)\/?([^/]*)/.exec(content);
  if (!match) return { iban: null, internalId: null, name: null };

  const idPart = (match[1] ?? "").trim();
  const name = (match[3] ?? "").trim() || (match[2] ?? "").trim() || null;

  // D85909804 = ING Spaarrekening internal ID (not an IBAN)
  const isRealIban = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}$/.test(idPart);
  return {
    iban: isRealIban ? idPart : null,
    internalId: !isRealIban && idPart ? idPart : null,
    name: name || null,
  };
}

function parse86Line(raw: string): Parsed86 {
  const empty: Parsed86 = {
    description: null, counterpartyName: null, counterpartyIban: null,
    counterpartyInternalId: null, reference: null, trcdCode: null,
    isReturn: false, returnReasonCode: null, isSpaarrekening: false,
  };
  if (!raw) return empty;

  let content = raw;
  if (/^\d{3}/.test(content)) content = content.slice(3);

  const extractTag = (tag: string): string | null => {
    const pattern = new RegExp(`/${tag}/([^/]+?)(?=/[A-Z]{2,6}/|$)`, "i");
    const match = pattern.exec(content);
    return match ? match[1].trim() : null;
  };

  const cntp = parseCNTP(content);
  const trcdMatch = /\/TRCD\/(\d+)\//.exec(content);
  const trcdCode = trcdMatch ? trcdMatch[1] : null;
  const rtrnMatch = /\/RTRN\/([^/]+)/.exec(content);
  const isReturn = !!rtrnMatch;
  const returnReasonCode = rtrnMatch ? rtrnMatch[1].trim() : null;
  const remi = extractTag("REMI") ?? extractTag("MEMO") ?? null;
  const eref = extractTag("EREF") ?? extractTag("KREF") ?? null;
  const nameTag = extractTag("NAME") ?? extractTag("BENM") ?? extractTag("ORDP") ?? null;
  const hasStructuredTags = /\/[A-Z]{2,6}\//.test(content);
  const description = remi ?? (hasStructuredTags ? null : content.trim()) ?? null;

  const isSpaarrekening =
    cntp.internalId === "D85909804" ||
    (cntp.name ?? "").toLowerCase().includes("zakelijke oranje spaarrekening") ||
    (description ?? "").toLowerCase().includes("zakelijke oranje spaarrekening") ||
    trcdCode === "00370";

  return {
    description: description || null,
    counterpartyName: cntp.name ?? nameTag,
    counterpartyIban: cntp.iban,
    counterpartyInternalId: cntp.internalId,
    reference: eref,
    trcdCode,
    isReturn,
    returnReasonCode,
    isSpaarrekening,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse :60F: and :62F: balance lines.
 * Format: C/D + YYMMDD + Currency + Amount
 * Example: C240101EUR10000,00
 */
function parseBalanceLine(raw: string): { currency: string; amount: number } | null {
  // Use first line only — content may have trailing block-footer like "-}" on next line
  const firstLine = raw.trim().split(/\r?\n/)[0].trim();
  const match = /^[CD](\d{6})([A-Z]{3})([\d,]+)$/.exec(firstLine);
  if (!match) return null;

  const [, , currency, amountStr] = match;
  const amount = parseMT940Amount(amountStr);
  if (amount === null) return null;

  return { currency, amount };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parseMT940(content: string): MT940Statement {
  // Normalize line endings and split into lines
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const errors: ImportRowError[] = [];
  const transactions: NormalizedTransaction[] = [];

  let reference = "";
  let accountIban: string | null = null;
  let currency = "EUR";
  let openingBalance = 0;
  let closingBalance = 0;

  // Collect tag blocks
  type TagBlock = { tag: string; content: string; lineNumber: number };
  const blocks: TagBlock[] = [];
  let currentBlock: TagBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect tag lines: :XX: or :XXX:
    const tagMatch = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (tagMatch) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { tag: tagMatch[1], content: tagMatch[2], lineNumber: i + 1 };
    } else if (currentBlock && line.trim()) {
      // Continuation line
      currentBlock.content += "\n" + line;
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  // Process blocks
  const rawTransactions: MT940RawTransaction[] = [];
  let lastTxIndex = -1;

  for (const block of blocks) {
    const { tag, content } = block;

    switch (tag) {
      case "20":
        reference = content.trim();
        break;

      case "25": {
        // Account identification — may contain IBAN
        const raw25 = content.trim().split("/")[0];
        accountIban = raw25 || null;
        break;
      }

      case "60F":
      case "60M": {
        const bal = parseBalanceLine(content);
        if (bal) {
          currency = bal.currency;
          openingBalance = bal.amount;
        }
        break;
      }

      case "61": {
        rawTransactions.push({
          lineIndex: block.lineNumber,
          line61: content,
          line86: "",
        });
        lastTxIndex = rawTransactions.length - 1;
        break;
      }

      case "86": {
        if (lastTxIndex >= 0) {
          rawTransactions[lastTxIndex].line86 = content;
        }
        break;
      }

      case "62F":
      case "62M": {
        const bal = parseBalanceLine(content);
        if (bal) closingBalance = bal.amount;
        break;
      }
    }
  }

  // Convert raw transactions to NormalizedTransaction
  for (let i = 0; i < rawTransactions.length; i++) {
    const { lineIndex, line61, line86 } = rawTransactions[i];
    const rowNum = i + 1;

    const parsed61 = parse61Line(line61);
    if (!parsed61) {
      errors.push({
        row: rowNum,
        field: "line61",
        message: `Could not parse MT940 :61: line: "${line61.slice(0, 40)}"`,
        rawValue: line61,
      });
      continue;
    }

    if (!parsed61.date) {
      errors.push({
        row: rowNum,
        field: "date",
        message: `Invalid date in :61: line`,
        rawValue: line61,
      });
      continue;
    }

    if (parsed61.amount === null) {
      errors.push({
        row: rowNum,
        field: "amount",
        message: `Invalid amount in :61: line`,
        rawValue: line61,
      });
      continue;
    }

    const parsed86 = parse86Line(line86);
    const signedAmount = parsed61.creditDebit * parsed61.amount;

    transactions.push({
      date: parsed61.date,
      amount: parsed61.amount,
      signedAmount,
      currency,
      description: parsed86.description,
      reference: parsed86.reference ?? parsed61.reference ?? null,
      counterpartyName: parsed86.counterpartyName,
      counterpartyIban: parsed86.counterpartyIban,
      accountIban: accountIban,
      rawData: {
        line61,
        line86,
        mt940Reference: reference,
        trcdCode: parsed86.trcdCode,
        isReturn: parsed86.isReturn,
        returnReasonCode: parsed86.returnReasonCode,
        isSpaarrekening: parsed86.isSpaarrekening,
        counterpartyInternalId: parsed86.counterpartyInternalId,
      },
    });
  }

  return {
    reference,
    accountIban,
    currency,
    openingBalance,
    closingBalance,
    transactions,
    errors,
  };
}
