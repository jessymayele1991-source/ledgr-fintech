/**
 * Ledgr i18n — Locale Registry
 * Zero external dependencies. Vercel-safe (pure client-side).
 */
import en, { type Translations } from "@/locales/en";
import nl from "@/locales/nl";
import fr from "@/locales/fr";
import de from "@/locales/de";

export type Locale = "en" | "nl" | "fr" | "de";

export interface LocaleConfig {
  code: Locale;
  name: string;      // native name
  label: string;     // English label
  flag: string;
  dateLocale: string; // date-fns locale key
  numberLocale: string; // Intl locale string
}

export const LOCALES: Record<Locale, LocaleConfig> = {
  en: { code: "en", name: "English",    label: "English", flag: "🇬🇧", dateLocale: "en-GB", numberLocale: "en-GB" },
  nl: { code: "nl", name: "Nederlands", label: "Dutch",   flag: "🇳🇱", dateLocale: "nl",    numberLocale: "nl-NL" },
  fr: { code: "fr", name: "Français",   label: "French",  flag: "🇫🇷", dateLocale: "fr",    numberLocale: "fr-FR" },
  de: { code: "de", name: "Deutsch",    label: "German",  flag: "🇩🇪", dateLocale: "de",    numberLocale: "de-DE" },
};

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "ledgr-locale";
export const TRANSLATIONS: Record<Locale, Translations> = { en, nl, fr, de };
export type { Translations };

/** Priority: localStorage → browser language → "en" */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (stored && stored in LOCALES) return stored;
  for (const lang of (navigator.languages ?? [navigator.language])) {
    const code = lang.split("-")[0].toLowerCase() as Locale;
    if (code in LOCALES) return code;
  }
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  if (typeof window !== "undefined") localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
