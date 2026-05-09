/**
 * LEDGR Import Engine — v2
 *
 * Orchestrates all file format parsers.
 * Detects format, parses, normalizes, validates.
 */

import type { NormalizedTransaction } from "@/types";
import { parseEuropeanNumber, parseCreditDebitIndicator } from "./number-parser";
import { detectColumnMapping, detectColumnMappingEnhanced } from "./column-detector";
import { parseMT940 } from "./mt940-parser";
import { parseMT942, isMT942 } from "./mt942-parser";
import { parseCAMT053 } from "./camt053-parser";
import { parseCAMT052, isCAMT052 } from "./camt052-parser";
import { parseCAMT054, isCAMT054 } from "./camt054-parser";
import { parsePain001, isPain001 } from "./pain001-parser";
import { parseSepaXml, isSepaXml } from "./sepa-xml-parser";
import { parseKbcCsv } from "./kbc-csv-parser";
import { validateTransactionBatch } from "./validator";
import type { ColumnMapping, ProcessedImport, FileFormat, ImportRowError } from "./types";
import * as XLSX from "xlsx";

export { detectColumnMapping };
export type { ColumnMapping, ProcessedImport, FileFormat, ImportRowError };
export { parseEuropeanNumber, parseCreditDebitIndicator };
export { validateTransactionBatch };

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectFileFormat(filename: string, content: string | null): FileFormat {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // Extension-based detection (high confidence)
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "mt940" || ext === "mta" || ext === "sta") {
    if (content && isMT942(content)) return "mt942";
    return "mt940";
  }
  if (ext === "mt942") return "mt942";
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";

  if (ext === "xml" || ext === "940") {
    if (content) {
      // CAMT family
      if (content.includes("BkToCstmrStmt") || content.includes("camt.053")) return "camt053";
      if (isCAMT052(content)) return "camt052";
      if (isCAMT054(content)) return "camt054";
      // SEPA/pain family
      if (isPain001(content)) return "pain001";
      if (isSepaXml(content)) return "sepa_xml";
      // MT940/942 in .xml wrapper (rare but exists)
      if (content.includes(":20:") && content.includes(":61:")) {
        return isMT942(content) ? "mt942" : "mt940";
      }
    }
    return "unknown";
  }

  if (ext === "txt") {
    if (content) {
      if (content.includes(":20:") && content.includes(":61:")) {
        return isMT942(content) ? "mt942" : "mt940";
      }
    }
    return "csv";
  }

  // Content-based fallback (no reliable extension)
  if (content) {
    // MT940/MT942
    if (content.includes(":20:") && content.includes(":61:")) {
      return isMT942(content) ? "mt942" : "mt940";
    }
    // CAMT family
    if (content.includes("BkToCstmrStmt") || content.includes("camt.053")) return "camt053";
    if (isCAMT052(content)) return "camt052";
    if (isCAMT054(content)) return "camt054";
    // SEPA/pain
    if (isPain001(content)) return "pain001";
    if (isSepaXml(content)) return "sepa_xml";
  }

  return "csv";
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIMITER DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectDelimiter(sample: string): string {
  const lines = sample.split("\n").slice(0, 5);
  const candidates = [";", ",", "\t", "|"];

  let bestDelimiter = ",";
  let bestScore = 0;

  for (const delimiter of candidates) {
    const escapedDelim = delimiter === "\t" ? "\\t" : `\\${delimiter}`;
    const counts = lines.map((line) => (line.match(new RegExp(escapedDelim, "g")) ?? []).length);
    if (counts[0] === 0) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const consistency = 1 - (counts.reduce((sum, c) => sum + Math.abs(c - avg), 0) / (counts.length * (avg || 1)));
    const score = avg * consistency;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parseCSV(
  content: string
): { headers: string[]; rows: Record<string, string>[] } {
  const normalized = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const allLines = normalized.split("\n");
  const lines = allLines.filter((l) => l.trim() && !l.trim().startsWith("#"));

  if (lines.length === 0) return { headers: [], rows: [] };

  const sample = lines.slice(0, 5).join("\n");
  const delimiter = detectDelimiter(sample);

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') { current += '"'; i += 2; continue; }
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
      i++;
    }
    result.push(current.trim());
    return result;
  };

  const rawHeaders = parseRow(lines[0]);
  const headers = rawHeaders.map((h) =>
    h.replace(/^["'\u201C\u201D]/, "").replace(/["'\u201C\u201D]$/, "").trim()
  );

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseRow(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      let val = values[j] ?? "";
      val = val.replace(/^["'\u201C\u201D]/, "").replace(/["'\u201C\u201D]$/, "");
      row[headers[j]] = val;
    }
    if (Object.values(row).every((v) => !v.trim())) continue;
    rows.push(row);
  }

  return { headers, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parseXLSX(
  buffer: ArrayBuffer
): { headers: string[]; rows: Record<string, string>[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");

  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    headers.push(cell ? String(cell.v ?? "").trim() : `Column${c + 1}`);
  }

  const rows: Record<string, string>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row: Record<string, string> = {};
    let hasContent = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = headers[c - range.s.c];
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) {
        let val: string;
        if (cell.t === "d" && cell.v instanceof Date) {
          const d = cell.v;
          const pad = (n: number) => String(n).padStart(2, "0");
          val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        } else if (cell.t === "n") {
          val = cell.w ?? String(cell.v);
        } else {
          val = cell.w ?? String(cell.v ?? "");
        }
        row[header] = val.trim();
        if (val.trim()) hasContent = true;
      } else {
        row[header] = "";
      }
    }
    if (hasContent) rows.push(row);
  }

  return { headers, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parseDate(raw: string): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  const FORMATS: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^(\d{4})-(\d{2})-(\d{2})$/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [/^(\d{4})-(\d{2})-(\d{2})T/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [/^(\d{2})-(\d{2})-(\d{4})$/, (m) => `${m[3]}-${m[2]}-${m[1]}`],
    [/^(\d{2})\/(\d{2})\/(\d{4})$/, (m) => `${m[3]}-${m[2]}-${m[1]}`],
    [/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, (m) => `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`],
    [/^(\d{4})(\d{2})(\d{2})$/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [/^(\d{2})(\d{2})(\d{4})$/, (m) => `${m[3]}-${m[2]}-${m[1]}`],
    [/^(\d{2})-(\d{2})-(\d{2})$/, (m) => {
      const yy = parseInt(m[3], 10);
      const year = yy <= 30 ? 2000 + yy : 1900 + yy;
      return `${year}-${m[2]}-${m[1]}`;
    }],
  ];

  for (const [regex, formatter] of FORMATS) {
    const match = regex.exec(s);
    if (match) {
      const iso = formatter(match) + "T00:00:00.000Z";
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        const year = d.getUTCFullYear();
        if (year >= 1980 && year <= 2100) return d;
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW NORMALIZER
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
  rowIndex: number
): { transaction: NormalizedTransaction | null; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];

  const rawDate = row[mapping.date] ?? "";
  const date = parseDate(rawDate);
  if (!date) {
    errors.push({ row: rowIndex, field: "date", message: `Cannot parse date: "${rawDate}"`, rawValue: rawDate });
    return { transaction: null, errors };
  }

  let signedAmount: number;

  if (mapping.debitAmount && mapping.creditAmount) {
    const rawDebit = row[mapping.debitAmount] ?? "";
    const rawCredit = row[mapping.creditAmount] ?? "";
    const debitVal = rawDebit.trim() ? parseEuropeanNumber(rawDebit) : null;
    const creditVal = rawCredit.trim() ? parseEuropeanNumber(rawCredit) : null;

    if (debitVal !== null && Math.abs(debitVal) > 0) {
      signedAmount = -Math.abs(debitVal);
    } else if (creditVal !== null && Math.abs(creditVal) > 0) {
      signedAmount = Math.abs(creditVal);
    } else {
      errors.push({
        row: rowIndex, field: "amount",
        message: `Both debit "${rawDebit}" and credit "${rawCredit}" are empty or unparseable.`,
        rawValue: `debit=${rawDebit} credit=${rawCredit}`,
      });
      return { transaction: null, errors };
    }
  } else {
    const rawAmount = row[mapping.amount] ?? "";
    const parsed = parseEuropeanNumber(rawAmount);
    if (parsed === null) {
      errors.push({ row: rowIndex, field: "amount", message: `Cannot parse amount: "${rawAmount}"`, rawValue: rawAmount });
      return { transaction: null, errors };
    }
    signedAmount = parsed;
    if (mapping.creditDebit) {
      const cdRaw = row[mapping.creditDebit] ?? "";
      const cdMultiplier = parseCreditDebitIndicator(cdRaw);
      if (cdMultiplier !== null) {
        signedAmount = Math.abs(parsed) * cdMultiplier;
      }
    }
  }

  const amount = Math.abs(signedAmount);
  const description = (mapping.description ? row[mapping.description] : null) ?? null;
  const counterpartyName = (mapping.counterpartyName ? row[mapping.counterpartyName] : null) ?? null;
  const rawCpIban = (mapping.counterpartyIban ? row[mapping.counterpartyIban] : null) ?? null;
  const reference = (mapping.reference ? row[mapping.reference] : null) ?? null;

  let counterpartyIban: string | null = null;
  if (rawCpIban?.trim()) {
    const ibanClean = rawCpIban.replace(/\s/g, "").toUpperCase();
    if (/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(ibanClean)) {
      counterpartyIban = ibanClean;
    }
  }

  return {
    transaction: {
      date,
      amount,
      signedAmount,
      currency: "EUR",
      description: description?.trim() || null,
      reference: reference?.trim() || null,
      counterpartyName: counterpartyName?.trim() || null,
      counterpartyIban,
      accountIban: null,
      rawData: row,
    },
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENCODING-AWARE FILE READER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a file as text, falling back to latin-1 if UTF-8 decode fails.
 *
 * Required for:
 *   - KBC BE CSV: latin-1 encoding (has ë, é, accented chars)
 *   - Deutsche Bank CSV: windows-1252 (German umlauts)
 *   - Sparkasse CSV: iso-8859-1
 *
 * Falls back gracefully: tries UTF-8 first, then latin-1.
 */
async function readFileWithFallback(file: File): Promise<string> {
  try {
    const text = await file.text();  // Default UTF-8
    // Quick sanity check: if file has latin-1 bytes they'll appear as replacement chars
    if (!text.includes("\uFFFD")) return text;
    // UTF-8 decode had replacement chars — try latin-1
  } catch { /* fall through */ }

  // Latin-1 fallback via ArrayBuffer
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  } catch {
    return await file.text();  // Last resort
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

export async function processImportFile(
  file: File,
  mappingOverride?: Partial<ColumnMapping>
): Promise<ProcessedImport> {
  const filename = file.name;
  const fileType = filename.split(".").pop()?.toLowerCase() ?? "";

  let textContent: string | null = null;
  if (!["xlsx", "xls"].includes(fileType)) {
    // Try UTF-8 first; fall back to latin-1 for KBC BE and DE/FR bank files
    textContent = await readFileWithFallback(file);
  }

  const format = detectFileFormat(filename, textContent);

  // ── KBC BE CSV detection: header contains "Rekeningnummer" + "Afschriftnummer" ──
  const isKbcCsv = textContent !== null &&
    textContent.includes("Rekeningnummer") &&
    textContent.includes("Afschriftnummer") &&
    textContent.includes("Bedrag");

  if (isKbcCsv) {
    const stmt = parseKbcCsv(textContent!);
    return {
      format: "csv",
      transactions: stmt.transactions,
      errors: stmt.errors,
      mapping: null,
      headers: ["Rekeningnummer", "Datum", "Omschrijving", "Bedrag", "Saldo", "Rekening tegenpartij", "Naam tegenpartij"],
      totalRows: stmt.totalRows,
      validRows: stmt.transactions.length,
      errorRows: stmt.errors.length,
      metadata: {
        accountIban: stmt.accountIban,
        currency: stmt.currency,
        openingBalance: stmt.openingBalance,
        closingBalance: stmt.closingBalance,
        bankProfile: "kbc-be",
      },
    };
  }

  if (format === "mt940" || format === "mt942") {
    const content = textContent ?? await file.text();
    const stmt = format === "mt942" ? parseMT942(content) : parseMT940(content);
    return {
      format,
      transactions: stmt.transactions,
      errors: stmt.errors,
      mapping: null,
      headers: [],
      totalRows: stmt.transactions.length + stmt.errors.length,
      validRows: stmt.transactions.length,
      errorRows: stmt.errors.length,
      metadata: {
        accountIban: stmt.accountIban,
        currency: stmt.currency,
        openingBalance: stmt.openingBalance,
        closingBalance: stmt.closingBalance,
      },
    };
  }

  if (format === "camt053" || format === "camt052" || format === "camt054") {
    const content = textContent ?? await file.text();
    const stmt =
      format === "camt052" ? parseCAMT052(content) :
      format === "camt054" ? parseCAMT054(content) :
      parseCAMT053(content);
    return {
      format,
      transactions: stmt.transactions,
      errors: stmt.errors,
      mapping: null,
      headers: [],
      totalRows: stmt.transactions.length + stmt.errors.length,
      validRows: stmt.transactions.length,
      errorRows: stmt.errors.length,
      metadata: {
        accountIban: stmt.accountIban,
        currency: stmt.currency,
        openingBalance: stmt.openingBalance ?? undefined,
        closingBalance: stmt.closingBalance ?? undefined,
        statementId: stmt.statementId,
      },
    };
  }

  if (format === "pain001") {
    const content = textContent ?? await file.text();
    const stmt = parsePain001(content);
    return {
      format,
      transactions: stmt.transactions,
      errors: stmt.errors,
      mapping: null,
      headers: [],
      totalRows: stmt.numberOfTransactions,
      validRows: stmt.transactions.length,
      errorRows: stmt.errors.length,
      metadata: {
        accountIban: stmt.debtorIban,
        currency: stmt.currency,
        statementId: stmt.messageId,
      },
    };
  }

  if (format === "sepa_xml") {
    const content = textContent ?? await file.text();
    const result = parseSepaXml(content);
    return {
      format,
      transactions: result.transactions,
      errors: result.errors,
      mapping: null,
      headers: [],
      totalRows: result.transactions.length + result.errors.length,
      validRows: result.transactions.length,
      errorRows: result.errors.length,
      metadata: {
        statementId: result.messageId ?? undefined,
        currency: result.rawSummary.currency,
      },
    };
  }

  let headers: string[];
  let rows: Record<string, string>[];

  if (format === "xlsx") {
    const buffer = await file.arrayBuffer();
    ({ headers, rows } = parseXLSX(buffer));
  } else {
    ({ headers, rows } = parseCSV(textContent!));
  }

  if (headers.length === 0) {
    return {
      format, transactions: [], errors: [{ row: 0, field: "file", message: "File appears to be empty or has no readable headers.", rawValue: "" }],
      mapping: null, headers: [], totalRows: 0, validRows: 0, errorRows: 1,
    };
  }

  const { mapping: detectedMapping, language } = detectColumnMappingEnhanced(headers);
  const mapping: ColumnMapping = { ...detectedMapping, ...mappingOverride };

  const transactions: NormalizedTransaction[] = [];
  const allErrors: ImportRowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { transaction, errors } = normalizeRow(rows[i], mapping, i + 2);
    allErrors.push(...errors);
    if (transaction) transactions.push(transaction);
  }

  return {
    format,
    transactions,
    errors: allErrors,
    mapping,
    headers,
    totalRows: rows.length,
    validRows: transactions.length,
    errorRows: new Set(allErrors.map((e) => e.row)).size,
    metadata: { language } as { language: string },
  };
}
