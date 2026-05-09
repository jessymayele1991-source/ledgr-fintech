"use client";

import { useState, useCallback, useRef, type DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileSpreadsheet, CheckCircle, AlertCircle, X,
  Loader2, ArrowRight, RotateCcw, ChevronDown, ChevronUp,
  Info, ShieldAlert, ShieldCheck, ArrowLeft,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface PreviewRow {
  date: string;
  amount: number;
  signedAmount: number;
  currency: string;
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  reference: string | null;
  issues: Array<{ field: string; code: string; message: string; severity: "error" | "warning" }>;
  willImport: boolean;
}

interface PreviewResult {
  format: string;
  headers: string[];
  mapping: Record<string, string> | null;
  metadata: { accountIban?: string; currency?: string; openingBalance?: number; closingBalance?: number } | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  parseErrors: Array<{ row: number; field: string; message: string }>;
  validationErrors: number;
  validationWarnings: number;
  preview: PreviewRow[];
  previewCapped: boolean;
  willImportCount: number;
}

interface ImportResult {
  importId: string;
  format: string;
  status: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  parseErrors: Array<{ row: number; field: string; message: string }>;
  metadata: Record<string, unknown> | null;
}

const FORMAT_LABELS: Record<string, string> = {
  csv: "CSV",
  xlsx: "Excel (XLSX)",
  mt940: "MT940",
  camt053: "CAMT.053 XML",
  txt: "Text",
  unknown: "Unknown",
};

const ALLOWED_EXTS = ["csv", "xlsx", "xls", "mt940", "mta", "sta", "xml", "txt"];

// ─────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────

async function fetchPreview(file: File, mapping?: Record<string, string>): Promise<PreviewResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (mapping) fd.append("mapping", JSON.stringify(mapping));
  const res = await fetch("/api/import/preview", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Preview failed");
  return json.data;
}

async function fetchAccounts() {
  const res = await fetch("/api/accounts");
  const json = await res.json();
  return json.data ?? [];
}

async function runImport(params: {
  file: File;
  accountId?: string;
  mapping?: Record<string, string>;
}): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("file", params.file);
  fd.append("settings", JSON.stringify({ accountId: params.accountId, currency: "EUR" }));
  if (params.mapping) fd.append("mapping", JSON.stringify(params.mapping));
  const res = await fetch("/api/import", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Import failed");
  return json.data;
}

// ─────────────────────────────────────────────
// STEP INDICATOR
// ─────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = [t("import.stepUpload"), t("import.stepPreview"), t("import.stepImport")];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const num = i + 1;
        const active = num === current;
        const done = num < current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold",
                done ? "bg-emerald-500 text-white" : active ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-500"
              )}>
                {done ? <CheckCircle className="w-4 h-4" /> : num}
              </div>
              <span className={cn("text-sm font-medium", active ? "text-gray-900" : "text-gray-400")}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("w-12 h-px mx-3", done ? "bg-emerald-300" : "bg-gray-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// COLUMN REMAPPER
// ─────────────────────────────────────────────

const MAPPING_FIELDS = [
  { key: "date", label: t("import.colDate"), required: true },
  { key: "amount", label: t("import.colAmount"), required: true },
  { key: "creditDebit", label: "Credit/Debit Indicator", required: false },
  { key: "debitAmount", label: "Debit Amount (split)", required: false },
  { key: "creditAmount", label: "Credit Amount (split)", required: false },
  { key: "description", label: t("import.colDescription"), required: false },
  { key: "counterpartyName", label: t("import.colCounterparty"), required: false },
  { key: "counterpartyIban", label: t("import.colIban"), required: false },
  { key: "reference", label: t("import.colDate"), required: false },
];

function ColumnRemapper({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-500" />
          Column Mapping
          {mapping.date && mapping.amount && (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Auto-detected</span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MAPPING_FIELDS.map(({ key, label, required }) => (
            <div key={key}>
              <label className="label text-xs">{label}</label>
              <select
                value={mapping[key] ?? ""}
                onChange={(e) => onChange({ ...mapping, [key]: e.target.value || "" })}
                className="input text-sm py-1.5"
              >
                <option value="">— not mapped —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PREVIEW TABLE
// ─────────────────────────────────────────────

function PreviewTable({ rows, capped }: { rows: PreviewRow[]; capped: boolean }) {
  const [showErrors, setShowErrors] = useState(false);
  const displayed = showErrors ? rows.filter((r) => !r.willImport || r.issues.length > 0) : rows;

  return (
    <div className="space-y-3">
      {(rows.some((r) => !r.willImport) || rows.some((r) => r.issues.length > 0)) && (
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => setShowErrors(!showErrors)}
            className={cn("btn py-1.5 px-3 text-xs", showErrors ? "btn-secondary" : "btn-ghost")}
          >
            {showErrors ? "Show all rows" : "Show problematic rows only"}
          </button>
          <span className="text-gray-400 text-xs">
            {rows.filter((r) => !r.willImport).length} will be skipped
          </span>
        </div>
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="data-table text-xs">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="w-8"></th>
                <th>Date</th>
                <th>Amount</th>
                <th>Description</th>
                <th>Counterparty</th>
                <th>IBAN</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    !row.willImport && "opacity-50 bg-red-50/40",
                    row.issues.some((is) => is.severity === "warning") && row.willImport && "bg-amber-50/30"
                  )}
                >
                  <td>
                    {row.willImport ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </td>
                  <td className="font-mono text-gray-600 whitespace-nowrap">{row.date}</td>
                  <td className={cn("tabular-nums font-medium whitespace-nowrap",
                    row.signedAmount >= 0 ? "text-emerald-600" : "text-red-500"
                  )}>
                    {row.signedAmount >= 0 ? "+" : ""}
                    {formatCurrency(row.signedAmount, row.currency)}
                  </td>
                  <td className="max-w-[180px]">
                    <span className="truncate block text-gray-700">
                      {row.description || <span className="text-gray-300">—</span>}
                    </span>
                  </td>
                  <td className="text-gray-600">
                    {row.counterpartyName || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="font-mono text-gray-400">
                    {row.counterpartyIban
                      ? row.counterpartyIban.slice(0, 8) + "…"
                      : <span className="text-gray-200">—</span>}
                  </td>
                  <td>
                    {row.issues.length > 0 && (
                      <div className="space-y-0.5">
                        {row.issues.map((issue, j) => (
                          <span
                            key={j}
                            title={issue.message}
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-xs mr-1 cursor-help",
                              issue.severity === "error"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {issue.code.replace(/_/g, " ").toLowerCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {capped && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
            Showing first 200 rows preview — all rows will be imported.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

type Step = 1 | 2 | 3;

export default function ImportPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  const previewMutation = useMutation({
    mutationFn: ({ file, mapping }: { file: File; mapping?: Record<string, string> }) =>
      fetchPreview(file, mapping),
    onSuccess: (data) => {
      setPreview(data);
      // Seed mapping state from auto-detected
      if (data.mapping) setMapping(data.mapping as Record<string, string>);
      setStep(2);
    },
  });

  const importMutation = useMutation({
    mutationFn: () => runImport({ file: file!, accountId: accountId || undefined, mapping }),
    onSuccess: (data) => {
      setResult(data);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // ── File handling ──────────────────────────────────────────────────
  const acceptFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTS.includes(ext)) {
      alert(`Unsupported file type ".${ext}". Please use CSV, XLSX, MT940, or CAMT.053 XML.`);
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
    setMapping({});
  };

  const handleDrag = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping({});
    setAccountId("");
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const refreshPreview = () => {
    if (!file) return;
    previewMutation.mutate({ file, mapping: Object.keys(mapping).length ? mapping : undefined });
  };

  // ─────────────────────────────────────────────────────────────────
  // STEP 1: Upload
  // ─────────────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200",
          dragActive ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
            : file ? "border-emerald-300 bg-emerald-50/50 cursor-default"
            : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50 cursor-pointer"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.mt940,.mta,.sta,.xml,.txt"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
          className="hidden"
        />

        {file ? (
          <div className="flex items-center justify-center gap-4">
            <FileSpreadsheet className="w-12 h-12 text-emerald-500 flex-shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="ml-4 btn-ghost p-2 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">Drop your bank statement here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {["CSV", "XLSX", "MT940", "CAMT.053 XML"].map((fmt) => (
                <span key={fmt} className="text-xs bg-white border border-gray-200 text-gray-500 px-2.5 py-1 rounded-full">
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Formats info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">European banks supported</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-xs text-blue-700">
          <span>✓ ING, ABN AMRO, Rabobank (NL)</span>
          <span>✓ Deutsche Bank, Sparkasse (DE)</span>
          <span>✓ Triodos, Bunq, SNS (NL)</span>
          <span>✓ BNP Paribas, Crédit Agricole (FR)</span>
          <span>✓ KBC, Belfius (BE)</span>
          <span>✓ Any MT940 or CAMT.053</span>
        </div>
      </div>

      {/* Account selector */}
      {file && (
        <div className="card p-5 space-y-3">
          <div>
            <label className="label">Link to Account <span className="text-gray-400 font-normal">(optional)</span></label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input"
            >
              <option value="">No specific account</option>
              {accounts.map((acc: { id: string; name: string; iban: string | null }) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}{acc.iban ? ` · ${acc.iban}` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">
              Links transactions to an account and enables transfer detection between your own IBANs.
            </p>
          </div>
        </div>
      )}

      {previewMutation.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {(previewMutation.error as Error).message}
        </div>
      )}

      {file && (
        <button
          onClick={() => previewMutation.mutate({ file })}
          disabled={previewMutation.isPending}
          className="btn-primary w-full justify-center py-3 text-base"
        >
          {previewMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Parsing file…</>
          ) : (
            <><ArrowRight className="w-5 h-5" /> Preview Import</>
          )}
        </button>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  // STEP 2: Preview & Column Mapping
  // ─────────────────────────────────────────────────────────────────
  const renderStep2 = () => {
    if (!preview) return null;

    const hasBlockingErrors = preview.validationErrors > 0 || preview.willImportCount === 0;

    return (
      <div className="space-y-6">
        {/* Format badge + metadata */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
            {FORMAT_LABELS[preview.format] ?? preview.format}
          </span>
          {preview.metadata?.accountIban && (
            <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2.5 py-1 rounded-full">
              {preview.metadata.accountIban}
            </span>
          )}
          {preview.metadata?.currency && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              {preview.metadata.currency}
            </span>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: t("import.previewTotalRows"), value: preview.totalRows, color: "text-gray-700" },
            { label: t("import.previewWillImport"), value: preview.willImportCount, color: "text-emerald-600" },
            { label: t("import.issueError"), value: preview.errorRows, color: preview.errorRows > 0 ? "text-red-500" : "text-gray-400" },
            { label: t("import.issueWarning"), value: preview.validationWarnings, color: preview.validationWarnings > 0 ? "text-amber-500" : "text-gray-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-3 text-center">
              <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Opening/closing balance check (MT940/CAMT) */}
        {preview.metadata?.openingBalance !== undefined && preview.metadata?.closingBalance !== undefined && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-400">Opening balance</p>
              <p className="font-semibold tabular-nums">{formatCurrency(preview.metadata.openingBalance ?? 0)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300" />
            <div>
              <p className="text-xs text-gray-400">Closing balance</p>
              <p className="font-semibold tabular-nums">{formatCurrency(preview.metadata.closingBalance ?? 0)}</p>
            </div>
            <div className="ml-auto">
              <p className="text-xs text-gray-400">Net movement</p>
              <p className={cn("font-semibold tabular-nums",
                ((preview.metadata.closingBalance ?? 0) - (preview.metadata.openingBalance ?? 0)) >= 0
                  ? "text-emerald-600" : "text-red-500"
              )}>
                {formatCurrency((preview.metadata.closingBalance ?? 0) - (preview.metadata.openingBalance ?? 0))}
              </p>
            </div>
          </div>
        )}

        {/* Column remapper (only for CSV/XLSX) */}
        {preview.headers.length > 0 && (
          <div className="space-y-3">
            <ColumnRemapper
              headers={preview.headers}
              mapping={mapping}
              onChange={(m) => setMapping(m)}
            />
            <button
              onClick={refreshPreview}
              disabled={previewMutation.isPending}
              className="btn-secondary text-xs py-1.5"
            >
              {previewMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Re-parse with new mapping
            </button>
          </div>
        )}

        {/* Parse errors */}
        {preview.parseErrors.length > 0 && (
          <details className="border border-red-200 rounded-xl overflow-hidden">
            <summary className="flex items-center gap-2 px-4 py-3 bg-red-50 cursor-pointer text-sm font-medium text-red-700 list-none">
              <ShieldAlert className="w-4 h-4" />
              {preview.parseErrors.length} rows could not be parsed
            </summary>
            <div className="p-4 space-y-1.5 max-h-48 overflow-y-auto">
              {preview.parseErrors.map((e, i) => (
                <div key={i} className="text-xs text-red-600 font-mono bg-red-50/50 rounded px-2 py-1">
                  Row {e.row} [{e.field}]: {e.message}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Preview table */}
        <PreviewTable rows={preview.preview} capped={preview.previewCapped} />

        {/* Action buttons */}
        <div className="flex gap-3">
          <button onClick={() => setStep(1)} className="btn-secondary gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || preview.willImportCount === 0}
            className="btn-primary flex-1 justify-center py-2.5"
          >
            {importMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
            ) : (
              <><Upload className="w-4 h-4" /> Import {preview.willImportCount} Transactions</>
            )}
          </button>
        </div>

        {importMutation.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
            {(importMutation.error as Error).message}
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────
  // STEP 3: Result
  // ─────────────────────────────────────────────────────────────────
  const renderStep3 = () => {
    if (!result) return null;
    const success = result.status === "COMPLETED";
    const partial = result.status === "PARTIAL";

    return (
      <div className="space-y-6">
        <div className={cn(
          "rounded-2xl p-6 flex items-start gap-4",
          success ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
        )}>
          {success
            ? <CheckCircle className="w-10 h-10 text-emerald-500 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="w-10 h-10 text-amber-500 flex-shrink-0 mt-0.5" />}
          <div>
            <p className="font-bold text-gray-900 text-lg">
              {t("import.successTitle")}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {result.importedRows} transactions imported · {result.skippedRows} duplicates skipped
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total rows", value: result.totalRows, bg: "bg-gray-50" },
            { label: t("import.successImported"), value: result.importedRows, bg: "bg-emerald-50", color: "text-emerald-600" },
            { label: t("import.successSkipped"), value: result.skippedRows, bg: "bg-amber-50", color: "text-amber-600" },
            { label: t("import.successErrors"), value: result.errorRows, bg: "bg-red-50", color: result.errorRows > 0 ? "text-red-600" : "text-gray-400" },
          ].map(({ label, value, bg, color }) => (
            <div key={label} className={cn("rounded-xl p-4 text-center", bg)}>
              <p className={cn("text-2xl font-bold tabular-nums", color ?? "text-gray-700")}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {result.parseErrors.length > 0 && (
          <div className="border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-amber-50 text-sm font-medium text-amber-800">
              Parse issues ({result.parseErrors.length})
            </div>
            <div className="p-3 space-y-1 max-h-36 overflow-y-auto">
              {result.parseErrors.map((e, i) => (
                <p key={i} className="text-xs text-amber-700 font-mono">
                  Row {e.row}: {e.message}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={reset} className="btn-secondary flex-1">
            Import Another File
          </button>
          <a href="/transactions" className="btn-primary flex-1 justify-center text-center py-2">
            View Transactions →
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Transactions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Import bank statements from European banks. Automatic format detection, column mapping, and duplicate prevention.
        </p>
      </div>

      <Steps current={step} />

      <div className="card p-6">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
}
