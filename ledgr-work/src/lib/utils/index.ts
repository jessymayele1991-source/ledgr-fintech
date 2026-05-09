import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { enGB, nl, fr, de } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Locale-aware date-fns locale map ─────────────────────────────────────

const DATE_LOCALES: Record<string, typeof enGB> = { en: enGB, nl, fr, de };

// ── Currency formatting ───────────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency: string = "EUR",
  locale: string = "nl-NL"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format using Ledgr locale code (en/nl/fr/de) */
export function formatCurrencyLocale(
  amount: number,
  appLocale: string = "en",
  currency: string = "EUR"
): string {
  const localeMap: Record<string, string> = { en: "en-GB", nl: "nl-NL", fr: "fr-FR", de: "de-DE" };
  return formatCurrency(amount, currency, localeMap[appLocale] ?? "en-GB");
}

// ── Date formatting ───────────────────────────────────────────────────────

export function formatDate(
  date: Date | string,
  fmt: string = "dd MMM yyyy",
  appLocale: string = "en"
): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt, { locale: DATE_LOCALES[appLocale] ?? enGB });
}

export function formatDateISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// ── String utils ──────────────────────────────────────────────────────────

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + "…";
}

// ── Transaction type helpers (color/bg unchanged, labels via t() in components) ─

export function getTransactionTypeColor(type: string): string {
  return (
    { INCOME: "text-emerald-600", EXPENSE: "text-red-500", TRANSFER: "text-blue-500", REFUND: "text-amber-500" }[type] ?? "text-gray-500"
  );
}

export function getTransactionTypeBg(type: string): string {
  return (
    {
      INCOME:   "bg-emerald-50 text-emerald-700 border-emerald-200",
      EXPENSE:  "bg-red-50 text-red-700 border-red-200",
      TRANSFER: "bg-blue-50 text-blue-700 border-blue-200",
      REFUND:   "bg-amber-50 text-amber-700 border-amber-200",
    }[type] ?? "bg-gray-50 text-gray-700 border-gray-200"
  );
}

export function getTransactionTypeLabel(type: string): string {
  return { INCOME: "Income", EXPENSE: "Expense", TRANSFER: "Transfer", REFUND: "Refund" }[type] ?? type;
}

export function safeNumber(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

export function buildQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  return search.toString();
}
