"use client";

import { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES, type Locale } from "@/lib/i18n/index";

interface Props {
  variant?: "dropdown" | "inline";
  className?: string;
  onChange?: (locale: Locale) => void;
}

export function LanguageSwitcher({ variant = "dropdown", className, onChange }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (l: Locale) => {
    setLocale(l);
    setOpen(false);
    onChange?.(l);
  };

  const list = Object.values(LOCALES);
  const current = LOCALES[locale];

  if (variant === "inline") {
    return (
      <div className={cn("space-y-1", className)}>
        {list.map((loc) => (
          <button
            key={loc.code}
            onClick={() => handleSelect(loc.code)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
              locale === loc.code
                ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                : "text-gray-700 hover:bg-gray-50"
            )}
          >
            <span className="text-base leading-none">{loc.flag}</span>
            <span className="flex-1">
              {loc.name}
              <span className="ml-2 text-xs text-gray-400">({loc.label})</span>
            </span>
            {locale === loc.code && <Check className="w-4 h-4 text-indigo-600" />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("settings.languageLabel")}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
      >
        <Globe className="w-4 h-4 text-gray-400" />
        <span>{current.flag}</span>
        <span>{current.name}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50"
        >
          {list.map((loc) => (
            <button
              key={loc.code}
              role="option"
              aria-selected={locale === loc.code}
              onClick={() => handleSelect(loc.code)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left",
                locale === loc.code ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <span className="text-base leading-none">{loc.flag}</span>
              <span className="flex-1">{loc.name}</span>
              {locale === loc.code && <Check className="w-3.5 h-3.5 text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
