"use client";

import {
  createContext, useContext, useState,
  useCallback, useEffect, type ReactNode,
} from "react";
import {
  LOCALES, DEFAULT_LOCALE, detectLocale, persistLocale,
  type Locale, type LocaleConfig,
} from "./index";
import { translate, type TranslationKey, type InterpolationValues } from "./translate";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  localeConfig: LocaleConfig;
  t: (key: TranslationKey, values?: InterpolationValues) => string;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start with default to avoid SSR mismatch; detect after hydration
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    // Runs only on client — safe to read localStorage / navigator
    setLocaleState(detectLocale());
  }, []);

  // Keep <html lang> in sync
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    persistLocale(l);
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: InterpolationValues) =>
      translate(locale, key, values),
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, localeConfig: LOCALES[locale], t, locales: LOCALES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n() must be inside <I18nProvider>. Wrap your app in Providers.");
  return ctx;
}

/** Shorthand — just the t() function. */
export function useT() {
  return useI18n().t;
}
