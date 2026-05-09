import type { Translations } from "@/locales/en";
import { TRANSLATIONS, DEFAULT_LOCALE, type Locale } from "./index";

// ── Build dot-notation union type of all leaf string paths ────────────────
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T]: K extends string
    ? T[K] extends string
      ? Prefix extends "" ? K : `${Prefix}.${K}`
      : T[K] extends Record<string, unknown>
        ? Leaves<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
        : never
    : never;
}[keyof T];

export type TranslationKey = Leaves<Translations>;
export type InterpolationValues = Record<string, string | number>;

/** Replace {placeholder} tokens in a string. */
export function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in values ? String(values[k]) : `{${k}}`
  );
}

/** Deep-get by dot-notation path. Returns undefined if path missing. */
function deepGet(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Translate a key for the given locale.
 * Fallback chain: locale dict → EN dict → raw key (never throws).
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: InterpolationValues
): string {
  const raw =
    deepGet(TRANSLATIONS[locale] as unknown as Record<string, unknown>, key) ??
    deepGet(TRANSLATIONS[DEFAULT_LOCALE] as unknown as Record<string, unknown>, key) ??
    key;
  return interpolate(raw, values);
}
