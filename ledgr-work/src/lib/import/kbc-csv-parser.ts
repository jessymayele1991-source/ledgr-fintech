/**
 * KBC Belgium CSV Parser
 *
 * Validated against real file:
 *   BE08736029512013_09-05-2025_tot_06-05-2026-0.csv
 *   1730 rows, 12 months, latin-1 encoding
 *
 * Column structure (18 cols):
 *   Rekeningnummer ; Rubrieknaam ; Naam ; Munt ; Afschriftnummer ; Datum ;
 *   Omschrijving ; Valuta ; Bedrag ; Saldo ; Credit ; Debet ;
 *   Rekening tegenpartij ; BIC code tegenpartij ; Naam tegenpartij ;
 *   Adres tegenpartij ; gestructureerde mededeling ; vrije mededeling
 *
 * Critical facts from audit:
 * - Encoding: latin-1 (NOT utf-8 — has accented chars e.g. ë in street names)
 * - Delimiter: semicolon
 * - Date format: DD/MM/YYYY
 * - Amount: "Bedrag" column, signed (negative = debit). Comma decimal.
 * - Credit/Debet columns are redundant with Bedrag (split view)
 * - Counterparty IBAN: "Rekening tegenpartij" — WITH SPACES (e.g. "BE62 2100 0785 7961")
 * - Structured ref: Belgian ***BBB/DDDD/CCCCC*** format
 * - AFRONDEN EN BELEGGEN = rounding investment → TRANSFER (no counterparty IBAN)
 * - INSTANTOVERSCHRIJVING NAAR/VAN = instant transfer
 * - BETALING VIA MAESTRO/BANCONTACT = card payment
 * - EUROPESE DOMICILIERING = SEPA direct debit
 */

import { parseEuropeanNumber, normalizeIban, validateIban } from "./number-parser";
import type { NormalizedTransaction } from "@/types";
import type { ImportRowError } from "./types";

export interface KbcCsvStatement {
  accountIban: string | null;
  accountHolder: string | null;
  currency: string;
  transactions: NormalizedTransaction[];
  errors: ImportRowError[];
  totalRows: number;
  openingBalance: number | null;
  closingBalance: number | null;
}

/** Belgian structured communication ***BBB/DDDD/CCCCC*** */
const BELGIAN_STRUCTURED_REF_RE = /\*{3}(\d{3})\/(\d{4})\/(\d{5})\*{3}/;

/** KBC own-account transfer patterns (no counterparty IBAN) */
const KBC_OWN_ACCOUNT_PATTERNS = [
  "AFRONDEN EN BELEGGEN",
  "AFREKENING FONDSEN",
  "GELDOPNEMING VIA",
  "STORTING AUTOMAAT",
  "CORRECTIE BETALING",
];

/** KBC transaction type → normalized category hint */
const KBC_TYPE_HINTS: Record<string, string> = {
  "BETALING VIA MAESTRO":     "card_payment",
  "BETALING VIA BANCONTACT":  "card_payment",
  "BETALING VIA DEBIT MASTERCARD": "card_payment",
  "EUROPESE DOMICILIERING":   "direct_debit",
  "INSTANTOVERSCHRIJVING VAN": "instant_transfer_in",
  "INSTANTOVERSCHRIJVING NAAR": "instant_transfer_out",
  "OVERSCHRIJVING VAN":       "bank_transfer_in",
  "OVERSCHRIJVING NAAR":      "bank_transfer_out",
  "DOORLOPENDE BETALINGSOPDRACHT": "standing_order",
  "AFRONDEN EN BELEGGEN":     "investment_rounding",
  "AFREKENING FONDSEN":       "fund_settlement",
  "AFREKENING MASTERCARD":    "credit_card_settlement",
};

/**
 * Detect KBC transaction type hint from Omschrijving prefix.
 */
function detectKbcTypeHint(description: string): string | null {
  const upper = description.toUpperCase().trim();
  for (const [pattern, hint] of Object.entries(KBC_TYPE_HINTS)) {
    if (upper.startsWith(pattern)) return hint;
  }
  return null;
}

/**
 * Check if a KBC description indicates an own-account transfer.
 * AFRONDEN EN BELEGGEN = rounding to investment account (no IBAN shown).
 */
function isKbcOwnAccountTransfer(description: string, counterpartyIban: string | null): boolean {
  // If we have a counterparty IBAN, it might be own account — handled by engine
  if (counterpartyIban) return false;
  const upper = description.toUpperCase().trim();
  return KBC_OWN_ACCOUNT_PATTERNS.some((p) => upper.startsWith(p));
}

/**
 * Parse DD/MM/YYYY date string.
 */
function parseKbcDate(raw: string): Date | null {
  if (!raw) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a signed Belgian amount: "-3,23" → -3.23, "84,00" → 84.00
 * Comma is decimal separator; no thousands separator in this file.
 */
function parseKbcBedrag(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const parsed = parseEuropeanNumber(raw.trim());
  return parsed;
}

/**
 * Extract counterparty name from Omschrijving when Naam tegenpartij is empty.
 * KBC embeds the name in the description for INSTANTOVERSCHRIJVING entries.
 * e.g. "INSTANTOVERSCHRIJVING VAN NL91 BUNQ ... STICHTING BITVAVO PAYMENTS"
 */
function extractNameFromDescription(description: string): string | null {
  // For INSTANTOVERSCHRIJVING entries, the name often follows the IBAN
  const m = /(?:VAN|NAAR)\s+[A-Z]{2}\d{2}[A-Z0-9\s]{4,}\s+(?:BANKIER\s+\w+:\s+\w+\s+)?(.+?)(?:\s+OM\s+\d|\s*$)/i.exec(description);
  if (m) return m[1].trim() || null;
  return null;
}

/**
 * Main KBC BE CSV parser.
 * Handles 1730-row real files validated from BE08736029512013.
 */
export function parseKbcCsv(content: string): KbcCsvStatement {
  const transactions: NormalizedTransaction[] = [];
  const errors: ImportRowError[] = [];

  // Split into lines — handle both CRLF and LF
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.length < 2) {
    return {
      accountIban: null, accountHolder: null, currency: "EUR",
      transactions: [], errors: [{ row: 0, field: "file", message: "Empty file", rawValue: "" }],
      totalRows: 0, openingBalance: null, closingBalance: null,
    };
  }

  // ── Parse header ────────────────────────────────────────────────────────────
  const headerLine = lines[0];
  const headers = headerLine.split(";").map((h) => h.trim().replace(/^["']|["']$/g, ""));

  // Map header names to indices
  const col = (name: string): number => {
    const idx = headers.findIndex((h) =>
      h.toLowerCase().includes(name.toLowerCase())
    );
    return idx;
  };

  const iRekeningnummer    = col("Rekeningnummer");
  const iNaam              = col("Naam");
  const iMunt              = col("Munt");
  const iDatum             = col("Datum");
  const iOmschrijving      = col("Omschrijving");
  const iBedrag            = col("Bedrag");
  const iSaldo             = col("Saldo");
  const iCredit            = col("Credit");
  const iDebet             = col("Debet");
  const iTegenIban         = headers.findIndex((h) => h.toLowerCase().includes("rekening tegenp"));
  const iTegenBic          = col("BIC code");
  const iTegenNaam         = col("Naam tegenpartij");
  const iGestructureerd    = col("gestructureerde mededeling");
  const iVrijeMededeling   = col("vrije mededeling");

  if (iBedrag === -1 || iDatum === -1) {
    return {
      accountIban: null, accountHolder: null, currency: "EUR",
      transactions: [],
      errors: [{ row: 0, field: "header", message: `Missing required columns. Found: ${headers.join(", ")}`, rawValue: headerLine }],
      totalRows: 0, openingBalance: null, closingBalance: null,
    };
  }

  // ── Parse rows ──────────────────────────────────────────────────────────────
  // Parse with a simple CSV splitter that handles quoted fields
  function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) {
        inQuote = true;
      } else if (ch === '"' && inQuote) {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = false;
      } else if (ch === ";" && !inQuote) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  // Extract metadata from first data row
  let accountIban: string | null = null;
  let accountHolder: string | null = null;
  let currency = "EUR";
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;

  const dataLines = lines.slice(1).filter((l) => l.trim());

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2;  // 1-indexed, +1 for header
    const line = dataLines[i];
    if (!line.trim()) continue;

    const fields = splitCsvLine(line);

    // Extract metadata from first row
    if (i === 0 && iRekeningnummer >= 0) {
      accountIban = normalizeIban(fields[iRekeningnummer] ?? "");
      accountHolder = fields[iNaam]?.trim() ?? null;
      currency = fields[iMunt]?.trim() || "EUR";
    }

    // ── Parse date ──────────────────────────────────────────────────────────
    const rawDate = fields[iDatum]?.trim() ?? "";
    const date = parseKbcDate(rawDate);
    if (!date) {
      errors.push({ row: rowNum, field: "date", message: `Invalid date: "${rawDate}"`, rawValue: rawDate });
      continue;
    }

    // ── Parse amount ────────────────────────────────────────────────────────
    const rawBedrag = fields[iBedrag]?.trim() ?? "";
    const bedrag = parseKbcBedrag(rawBedrag);
    if (bedrag === null) {
      errors.push({ row: rowNum, field: "amount", message: `Invalid amount: "${rawBedrag}"`, rawValue: rawBedrag });
      continue;
    }

    // amount is always positive; signedAmount preserves sign
    const amount = Math.abs(bedrag);
    const signedAmount = bedrag;

    // ── Counterparty ────────────────────────────────────────────────────────
    const rawTegenIban = iTegenIban >= 0 ? (fields[iTegenIban]?.trim() ?? "") : "";
    // KBC stores IBANs WITH SPACES — normalize
    const counterpartyIban = rawTegenIban
      ? (validateIban(normalizeIban(rawTegenIban)) ? normalizeIban(rawTegenIban) : null)
      : null;

    const counterpartyBic = iTegenBic >= 0 ? (fields[iTegenBic]?.trim() || null) : null;
    const counterpartyNameRaw = iTegenNaam >= 0 ? (fields[iTegenNaam]?.trim() || null) : null;

    // Description
    const description = iOmschrijving >= 0 ? (fields[iOmschrijving]?.trim() || null) : null;
    const counterpartyName = counterpartyNameRaw || (description ? extractNameFromDescription(description) : null);

    // References
    const structuredRef = iGestructureerd >= 0 ? (fields[iGestructureerd]?.trim() || null) : null;
    const freeRef = iVrijeMededeling >= 0 ? (fields[iVrijeMededeling]?.trim() || null) : null;
    const reference = structuredRef || freeRef || null;

    // Saldo
    const rawSaldo = iSaldo >= 0 ? (fields[iSaldo]?.trim() ?? "") : "";
    const saldo = rawSaldo ? parseKbcBedrag(rawSaldo) : null;
    if (i === 0 && saldo !== null) {
      // First row saldo = balance AFTER this transaction
      openingBalance = null;  // KBC CSV doesn't explicitly give opening balance
    }
    if (i === dataLines.length - 1 && saldo !== null) {
      closingBalance = saldo;
    }

    // Type hint for rawData
    const typeHint = description ? detectKbcTypeHint(description) : null;
    const isSpaarrekening = description ? isKbcOwnAccountTransfer(description, counterpartyIban) : false;
    const isReturn = description
      ? description.toUpperCase().includes("CORRECTIE") || description.toUpperCase().includes("TERUGBOEKING")
      : false;

    transactions.push({
      date,
      amount,
      signedAmount,
      currency,
      description,
      reference,
      counterpartyName,
      counterpartyIban,
      accountIban,
      rawData: {
        kbcTypeHint: typeHint,
        isSpaarrekening,
        isReturn,
        counterpartyBic,
        structuredRef,
        freeRef,
        saldo: saldo,
        statementNumber: fields[4]?.trim() ?? null,
      },
    });
  }

  return {
    accountIban,
    accountHolder,
    currency,
    transactions,
    errors,
    totalRows: dataLines.length,
    openingBalance,
    closingBalance,
  };
}
