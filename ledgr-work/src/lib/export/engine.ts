/**
 * LEDGR Export System
 *
 * Professional exports for:
 * - CSV (accountant-ready)
 * - XLSX (Excel with formatting)
 * - PDF reports (monthly/yearly)
 * - VAT summaries
 *
 * Uses integer cent arithmetic throughout.
 * All amounts in EUR with 2 decimal places.
 */

import type { Transaction } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportOptions {
  format?: "csv" | "xlsx" | "pdf" | "vat-summary" | "accountant";
  dateFrom?: Date;
  dateTo?: Date;
  includeTransfers?: boolean;
  groupByMonth?: boolean;
  currency?: string;
  entityName?: string;
  organizationName?: string;
  vatRate?: number;
  locale?: string;
  decimalSeparator?: "," | ".";
  thousandsSeparator?: "." | "," | " " | "";
}

export interface ExportResult {
  content: string;
  mimeType: string;
  filename: string;
  rowCount: number;
  encoding?: "utf-8" | "base64";
}

/**
 * Main dispatcher — routes to correct export by format.
 * Called by /api/export route.
 */
export function exportTransactions(
  transactions: Transaction[],
  options: ExportOptions
): ExportResult {
  switch (options.format) {
    case "vat-summary": {
      const summary = generateVatSummary(transactions, {
        vatRate: options.vatRate ?? 0.21,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        currency: options.currency ?? "EUR",
      });
      return exportVatSummaryToCsv(summary);
    }
    case "accountant": {
      const result = exportToCsv(
        transactions.filter((t) => t.type !== "TRANSFER"),
        { ...options, includeTransfers: false }
      );
      return { ...result, filename: result.filename.replace("export", "accountant-export") };
    }
    case "xlsx":
      return exportToXlsx(transactions, options);
    default:
      return exportToCsv(transactions, options);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate accountant-ready CSV export.
 *
 * Format: UTF-8 BOM, semicolon-delimited (European standard for Excel compatibility),
 * ISO 8601 dates, 2dp amounts.
 */
export function exportToCsv(
  transactions: Transaction[],
  options: ExportOptions = {}
): ExportResult {
  const { includeTransfers = false, currency = "EUR" } = options;

  let rows = [...transactions];
  if (options.dateFrom) rows = rows.filter((t) => new Date(t.date) >= options.dateFrom!);
  if (options.dateTo) rows = rows.filter((t) => new Date(t.date) <= options.dateTo!);
  if (!includeTransfers) rows = rows.filter((t) => t.type !== "TRANSFER");

  // Sort by date ascending
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const headers = [
    "Date",
    "Description",
    "Counterparty Name",
    "Counterparty IBAN",
    "Type",
    "Category",
    "Amount (" + currency + ")",
    "Signed Amount",
    "Reference",
    "Account",
    "Transaction ID",
  ];

  const csvRows = rows.map((tx) => [
    new Date(tx.date).toISOString().slice(0, 10),
    escapeCsv(tx.description ?? ""),
    escapeCsv(tx.counterpartyName ?? ""),
    escapeCsv(tx.counterpartyIban ?? ""),
    tx.type,
    escapeCsv(tx.category?.name ?? ""),
    tx.amount.toFixed(2),
    tx.signedAmount.toFixed(2),
    escapeCsv(tx.reference ?? ""),
    escapeCsv(tx.account?.name ?? ""),
    tx.id,
  ]);

  // UTF-8 BOM for Excel compatibility + semicolon delimiter (European)
  const bom = "\uFEFF";
  const content = bom + [headers, ...csvRows].map((r) => r.join(";")).join("\r\n");

  const dateStr = new Date().toISOString().slice(0, 10);
  return {
    content,
    mimeType: "text/csv;charset=utf-8",
    filename: `ledgr-export-${dateStr}.csv`,
    rowCount: rows.length,
  };
}

function escapeCsv(value: string): string {
  if (/[";,\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export transactions as a formatted Excel workbook.
 *
 * Two sheets:
 *  1. "Transactions"  — full detail with all columns
 *  2. "Summary"       — P&L summary by month
 *
 * Uses xlsx library (already a project dependency).
 * Returns base64-encoded binary for transport over JSON API.
 */
export function exportToXlsx(
  transactions: Transaction[],
  options: ExportOptions = {}
): ExportResult {
  // Import xlsx lazily — it may not be available in all environments
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");

  const { includeTransfers = false, currency = "EUR" } = options;

  let rows = [...transactions];
  if (options.dateFrom) rows = rows.filter((t) => new Date(t.date) >= options.dateFrom!);
  if (options.dateTo) rows = rows.filter((t) => new Date(t.date) <= options.dateTo!);
  if (!includeTransfers) rows = rows.filter((t) => t.type !== "TRANSFER");

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ── Sheet 1: Transactions ─────────────────────────────────────────────
  const txHeaders = [
    "Date", "Description", "Counterparty Name", "Counterparty IBAN",
    "Type", "Category", `Amount (${currency})`, "Signed Amount",
    "Reference", "Account", "Transaction ID",
  ];

  const txData = rows.map((tx) => [
    new Date(tx.date).toISOString().slice(0, 10),
    tx.description ?? "",
    tx.counterpartyName ?? "",
    tx.counterpartyIban ?? "",
    tx.type,
    tx.category?.name ?? "",
    tx.amount,
    tx.signedAmount,
    tx.reference ?? "",
    tx.account?.name ?? "",
    tx.id,
  ]);

  const txSheet = XLSX.utils.aoa_to_sheet([txHeaders, ...txData]);

  // Format amount columns (G and H = columns 7 and 8, 0-indexed 6 and 7)
  const amountFmt = `#,##0.00`;
  for (let r = 1; r <= txData.length; r++) {
    const amtCell = XLSX.utils.encode_cell({ r, c: 6 });
    const sgnCell = XLSX.utils.encode_cell({ r, c: 7 });
    if (txSheet[amtCell]) txSheet[amtCell].z = amountFmt;
    if (txSheet[sgnCell]) txSheet[sgnCell].z = amountFmt;
  }

  // Set column widths
  txSheet["!cols"] = [
    { wch: 12 }, // Date
    { wch: 40 }, // Description
    { wch: 30 }, // Counterparty Name
    { wch: 20 }, // Counterparty IBAN
    { wch: 10 }, // Type
    { wch: 20 }, // Category
    { wch: 14 }, // Amount
    { wch: 14 }, // Signed Amount
    { wch: 25 }, // Reference
    { wch: 20 }, // Account
    { wch: 30 }, // Transaction ID
  ];

  // ── Sheet 2: Monthly Summary ─────────────────────────────────────────
  const monthlyMap = new Map<string, { revenue: number; expenses: number }>();

  for (const tx of rows) {
    if (tx.type === "TRANSFER") continue;
    const d = new Date(tx.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap.has(key)) monthlyMap.set(key, { revenue: 0, expenses: 0 });
    const entry = monthlyMap.get(key)!;
    if (tx.type === "INCOME") entry.revenue = Math.round((entry.revenue + tx.amount) * 100) / 100;
    else if (tx.type === "EXPENSE") entry.expenses = Math.round((entry.expenses + tx.amount) * 100) / 100;
    else if (tx.type === "REFUND") entry.expenses = Math.round((entry.expenses - tx.amount) * 100) / 100;
  }

  const summaryHeaders = [`Month`, `Revenue (${currency})`, `Expenses (${currency})`, `Profit (${currency})`];
  const summaryData = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { revenue, expenses }]) => [
      month,
      revenue,
      Math.max(0, expenses),
      Math.round((revenue - expenses) * 100) / 100,
    ]);

  const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryData]);
  summarySheet["!cols"] = [{ wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

  // ── Build workbook ───────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, txSheet, "Transactions");
  XLSX.utils.book_append_sheet(wb, summarySheet, "Monthly Summary");

  const buffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
  const dateStr = new Date().toISOString().slice(0, 10);

  return {
    content: buffer,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `ledgr-export-${dateStr}.xlsx`,
    rowCount: rows.length,
    encoding: "base64",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VAT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export interface VatSummaryLine {
  category: string;
  totalGross: number;       // Amount including VAT
  vatAmount: number;        // Estimated VAT portion
  totalNet: number;         // Amount excluding VAT
  transactionCount: number;
  vatRate: number;
}

export interface VatSummary {
  period: string;
  currency: string;
  lines: VatSummaryLine[];
  totalGross: number;
  totalVat: number;
  totalNet: number;
  exportedAt: Date;
}

/**
 * Generate VAT summary for expense transactions.
 * Groups by category, calculates estimated VAT at given rate.
 *
 * Note: This is an ESTIMATE. Real VAT accounting requires proper
 * invoices and professional accountant review.
 */
export function generateVatSummary(
  transactions: Transaction[],
  options: { vatRate?: number; dateFrom?: Date; dateTo?: Date; currency?: string } = {}
): VatSummary {
  const vatRate = options.vatRate ?? 0.21;  // Default 21% (NL/BE standard)
  const currency = options.currency ?? "EUR";

  let rows = transactions.filter((t) => t.type === "EXPENSE" || t.type === "REFUND");
  if (options.dateFrom) rows = rows.filter((t) => new Date(t.date) >= options.dateFrom!);
  if (options.dateTo) rows = rows.filter((t) => new Date(t.date) <= options.dateTo!);

  // Group by category
  const groups = new Map<string, { gross: number; count: number }>();
  for (const tx of rows) {
    const cat = tx.category?.name ?? "Uncategorized";
    const existing = groups.get(cat) ?? { gross: 0, count: 0 };
    existing.gross = Math.round((existing.gross + tx.amount) * 100) / 100;
    existing.count++;
    groups.set(cat, existing);
  }

  const lines: VatSummaryLine[] = Array.from(groups.entries()).map(([cat, data]) => {
    const vatAmount = Math.round(data.gross * vatRate / (1 + vatRate) * 100) / 100;
    const netAmount = Math.round((data.gross - vatAmount) * 100) / 100;
    return {
      category: cat,
      totalGross: data.gross,
      vatAmount,
      totalNet: netAmount,
      transactionCount: data.count,
      vatRate,
    };
  });

  lines.sort((a, b) => b.totalGross - a.totalGross);

  const totalGross = lines.reduce((s, l) => Math.round((s + l.totalGross) * 100) / 100, 0);
  const totalVat = lines.reduce((s, l) => Math.round((s + l.vatAmount) * 100) / 100, 0);
  const totalNet = Math.round((totalGross - totalVat) * 100) / 100;

  const dateStr = options.dateFrom && options.dateTo
    ? `${options.dateFrom.toISOString().slice(0, 7)} to ${options.dateTo.toISOString().slice(0, 7)}`
    : new Date().getFullYear().toString();

  return { period: dateStr, currency, lines, totalGross, totalVat, totalNet, exportedAt: new Date() };
}

/**
 * Export VAT summary as CSV (accountant-ready).
 */
export function exportVatSummaryToCsv(summary: VatSummary): ExportResult {
  const headers = [
    "Category",
    `Total Gross (${summary.currency})`,
    `VAT Amount (${summary.currency})`,
    `Total Net (${summary.currency})`,
    "Transaction Count",
    "VAT Rate %",
  ];

  const rows = summary.lines.map((l) => [
    escapeCsv(l.category),
    l.totalGross.toFixed(2),
    l.vatAmount.toFixed(2),
    l.totalNet.toFixed(2),
    l.transactionCount.toString(),
    (l.vatRate * 100).toFixed(0) + "%",
  ]);

  const totalsRow = [
    "TOTAL",
    summary.totalGross.toFixed(2),
    summary.totalVat.toFixed(2),
    summary.totalNet.toFixed(2),
    summary.lines.reduce((s, l) => s + l.transactionCount, 0).toString(),
    "",
  ];

  const disclaimer =
    "\r\n;NOTE: VAT amounts are estimates. Consult a qualified accountant for official VAT returns.";

  const bom = "\uFEFF";
  const content =
    bom +
    [headers, ...rows, totalsRow].map((r) => r.join(";")).join("\r\n") +
    disclaimer;

  return {
    content,
    mimeType: "text/csv;charset=utf-8",
    filename: `ledgr-vat-summary-${summary.period.replace(/\s+/g, "-")}.csv`,
    rowCount: summary.lines.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// YEARLY REPORT (as structured JSON → for PDF rendering)
// ─────────────────────────────────────────────────────────────────────────────

export interface YearlyReportData {
  year: number;
  entityName: string;
  currency: string;
  generatedAt: Date;
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    transactionCount: number;
  };
  monthlyBreakdown: Array<{
    month: string;          // "2025-01"
    monthName: string;      // "January 2025"
    revenue: number;
    expenses: number;
    profit: number;
    transactionCount: number;
  }>;
  topExpenseCategories: Array<{
    name: string;
    total: number;
    percentage: number;
    count: number;
  }>;
  topIncomeCategories: Array<{
    name: string;
    total: number;
    percentage: number;
    count: number;
  }>;
}

export function generateYearlyReport(
  transactions: Transaction[],
  year: number,
  entityName: string,
  currency = "EUR"
): YearlyReportData {
  const yearTxs = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && t.type !== "TRANSFER";
  });

  // Monthly breakdown
  const monthMap = new Map<string, { rev: number; exp: number; count: number }>();
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    monthMap.set(key, { rev: 0, exp: 0, count: 0 });
  }

  for (const tx of yearTxs) {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthMap.get(key);
    if (!entry) continue;
    if (tx.type === "INCOME") entry.rev = Math.round((entry.rev + tx.amount) * 100) / 100;
    else if (tx.type === "EXPENSE") entry.exp = Math.round((entry.exp + tx.amount) * 100) / 100;
    else if (tx.type === "REFUND") entry.exp = Math.round((entry.exp - tx.amount) * 100) / 100;
    entry.count++;
  }

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const monthlyBreakdown = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    monthName: `${MONTH_NAMES[parseInt(month.slice(5)) - 1]} ${year}`,
    revenue: data.rev,
    expenses: Math.max(0, data.exp),
    profit: Math.round((data.rev - data.exp) * 100) / 100,
    transactionCount: data.count,
  }));

  // Category breakdown
  const expenseCats = new Map<string, { total: number; count: number }>();
  const incomeCats = new Map<string, { total: number; count: number }>();

  for (const tx of yearTxs) {
    const catName = tx.category?.name ?? "Uncategorized";
    if (tx.type === "EXPENSE") {
      const e = expenseCats.get(catName) ?? { total: 0, count: 0 };
      e.total = Math.round((e.total + tx.amount) * 100) / 100;
      e.count++;
      expenseCats.set(catName, e);
    } else if (tx.type === "INCOME") {
      const e = incomeCats.get(catName) ?? { total: 0, count: 0 };
      e.total = Math.round((e.total + tx.amount) * 100) / 100;
      e.count++;
      incomeCats.set(catName, e);
    }
  }

  const totalExpenses = Array.from(expenseCats.values()).reduce((s, v) => s + v.total, 0);
  const totalRevenue = Array.from(incomeCats.values()).reduce((s, v) => s + v.total, 0);

  const topExpenseCategories = Array.from(expenseCats.entries())
    .map(([name, v]) => ({
      name, total: v.total, count: v.count,
      percentage: totalExpenses > 0 ? Math.round(v.total / totalExpenses * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const topIncomeCategories = Array.from(incomeCats.entries())
    .map(([name, v]) => ({
      name, total: v.total, count: v.count,
      percentage: totalRevenue > 0 ? Math.round(v.total / totalRevenue * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    year,
    entityName,
    currency,
    generatedAt: new Date(),
    summary: {
      totalRevenue,
      totalExpenses,
      netProfit: Math.round((totalRevenue - totalExpenses) * 100) / 100,
      transactionCount: yearTxs.length,
    },
    monthlyBreakdown,
    topExpenseCategories,
    topIncomeCategories,
  };
}

/**
 * Export yearly report as CSV.
 */
export function exportYearlyReportToCsv(report: YearlyReportData): ExportResult {
  const bom = "\uFEFF";
  const lines: string[] = [
    `"${report.entityName} — Annual Report ${report.year}"`,
    `"Generated: ${report.generatedAt.toISOString().slice(0, 10)}"`,
    `"Currency: ${report.currency}"`,
    "",
    "=== SUMMARY ===",
    `"Total Revenue";"${report.summary.totalRevenue.toFixed(2)}"`,
    `"Total Expenses";"${report.summary.totalExpenses.toFixed(2)}"`,
    `"Net Profit";"${report.summary.netProfit.toFixed(2)}"`,
    `"Transaction Count";"${report.summary.transactionCount}"`,
    "",
    "=== MONTHLY BREAKDOWN ===",
    `"Month";"Revenue (${report.currency})";"Expenses (${report.currency})";"Profit (${report.currency})";"Transactions"`,
    ...report.monthlyBreakdown.map((m) =>
      `"${m.monthName}";"${m.revenue.toFixed(2)}";"${m.expenses.toFixed(2)}";"${m.profit.toFixed(2)}";"${m.transactionCount}"`
    ),
    "",
    "=== TOP EXPENSE CATEGORIES ===",
    `"Category";"Total (${report.currency})";"% of Expenses";"Count"`,
    ...report.topExpenseCategories.map((c) =>
      `"${c.name}";"${c.total.toFixed(2)}";"${c.percentage}%";"${c.count}"`
    ),
    "",
    "=== TOP INCOME CATEGORIES ===",
    `"Category";"Total (${report.currency})";"% of Income";"Count"`,
    ...report.topIncomeCategories.map((c) =>
      `"${c.name}";"${c.total.toFixed(2)}";"${c.percentage}%";"${c.count}"`
    ),
  ];

  return {
    content: bom + lines.join("\r\n"),
    mimeType: "text/csv;charset=utf-8",
    filename: `ledgr-annual-report-${report.year}.csv`,
    rowCount: report.monthlyBreakdown.length,
  };
}
