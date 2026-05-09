"use client";

import { useState, type ReactNode } from "react";
import { Download, FileText, Table, Receipt, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

type ExportFormat = "csv" | "vat-summary" | "accountant" | "xlsx";

interface ExportOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: ReactNode;
  badge?: string;
}

function buildExportUrl(format: ExportFormat, params: Record<string, string>): string {
  const qs = new URLSearchParams({ format, ...params });
  return `/api/export?${qs.toString()}`;
}

export default function ExportPage() {
  const { t } = useI18n();

  const EXPORT_OPTIONS: ExportOption[] = [
    {
      id: "csv",
      label: t("export.optionCsv"),
      description: t("export.optionCsvDesc"),
      icon: <Table className="w-5 h-5" />,
    },
    {
      id: "accountant",
      label: t("export.optionAccountant"),
      description: t("export.optionAccountantDesc"),
      icon: <FileText className="w-5 h-5" />,
      badge: t("common.recommended"),
    },
    {
      id: "vat-summary",
      label: t("export.optionVat"),
      description: t("export.optionVatDesc"),
      icon: <Receipt className="w-5 h-5" />,
    },
  ];

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("accountant");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [includeTransfers, setIncludeTransfers] = useState(false);
  const [vatRate, setVatRate] = useState("21");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        dateFrom,
        dateTo,
        includeTransfers: includeTransfers ? "true" : "false",
        vatRate: (parseFloat(vatRate) / 100).toFixed(2),
        locale: "nl-NL",
      };
      if (orgName) params.orgName = orgName;

      const url = buildExportUrl(selectedFormat, params);
      const res = await fetch(url);

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error?.message ?? "Export failed");
        return;
      }

      // Get filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] ?? `ledgr-export-${new Date().toISOString().slice(0, 10)}.csv`;

      // Download the file
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      setLastExport(filename);
    } finally {
      setLoading(false);
    }
  };

  // Current year as quick filter
  const currentYear = new Date().getFullYear();

  const quickRanges = [
    { label: "This month", from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
    { label: "Last 3 months", from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); })(), to: new Date().toISOString().slice(0, 10) },
    { label: `Full ${currentYear}`, from: `${currentYear}-01-01`, to: `${currentYear}-12-31` },
    { label: `Full ${currentYear - 1}`, from: `${currentYear - 1}-01-01`, to: `${currentYear - 1}-12-31` },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("export.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Download your transactions in accountant-ready formats. All amounts in EUR, UTF-8 BOM for Excel.
        </p>
      </div>

      {/* Format Selection */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Export Format</h2>
        <div className="grid gap-3">
          {EXPORT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={cn(
                "card px-5 py-4 flex items-start gap-4 cursor-pointer transition-all",
                selectedFormat === opt.id
                  ? "border-indigo-400 bg-indigo-50/50 ring-1 ring-indigo-300"
                  : "hover:border-gray-300"
              )}
            >
              <input
                type="radio"
                name="format"
                value={opt.id}
                checked={selectedFormat === opt.id}
                onChange={() => setSelectedFormat(opt.id)}
                className="sr-only"
              />
              <div className={cn(
                "mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                selectedFormat === opt.id ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500"
              )}>
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">{opt.label}</span>
                  {opt.badge && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
              </div>
              <div className={cn(
                "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1",
                selectedFormat === opt.id ? "border-indigo-600 bg-indigo-600" : "border-gray-300"
              )} />
            </label>
          ))}
        </div>
      </div>

      {/* Date Range */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Date Range</h2>

        {/* Quick ranges */}
        <div className="flex flex-wrap gap-2">
          {quickRanges.map((r) => (
            <button
              key={r.label}
              onClick={() => { setDateFrom(r.from); setDateTo(r.to); }}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                dateFrom === r.from && dateTo === r.to
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Options</h2>

        <div>
          <label className="label">Organization Name (for report header)</label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Your company or name"
            className="input"
          />
        </div>

        {selectedFormat === "vat-summary" && (
          <div>
            <label className="label">VAT Rate (%)</label>
            <div className="flex gap-2">
              {["21", "9", "0"].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setVatRate(rate)}
                  className={cn(
                    "px-4 py-2 text-sm rounded-lg border transition-colors",
                    vatRate === rate
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  {rate}%
                </button>
              ))}
              <input
                type="number"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="input w-24"
                placeholder="21"
                min={0}
                max={100}
                step={0.1}
              />
            </div>
            <p className="text-xs text-amber-600 mt-2">
              ⚠ VAT amounts are estimates only. Always consult a qualified accountant for official VAT returns.
            </p>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTransfers}
            onChange={(e) => setIncludeTransfers(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
          />
          <span className="text-sm text-gray-700">
            Include transfer transactions
            <span className="text-gray-400 ml-1 text-xs">(excluded by default — not P&L relevant)</span>
          </span>
        </label>
      </div>

      {/* Export button */}
      <div className="space-y-3">
        <button
          onClick={handleExport}
          disabled={loading || !dateFrom || !dateTo}
          className="btn-primary w-full justify-center py-3 text-base"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Generating export…</>
          ) : (
            <><Download className="w-5 h-5" /> Download {EXPORT_OPTIONS.find((o) => o.id === selectedFormat)?.label}</>
          )}
        </button>

        {lastExport && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Downloaded: <span className="font-mono text-xs">{lastExport}</span></span>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-gray-400 border-t border-gray-100 pt-4 space-y-1">
        <p>All exports use UTF-8 BOM encoding for European Excel compatibility.</p>
        <p>CSV files use semicolons as delimiters (European standard).</p>
        <p>Amounts use 2 decimal places in standard dot format.</p>
        <p>Transfers between your own accounts are excluded from P&L exports by default.</p>
      </div>
    </div>
  );
}
