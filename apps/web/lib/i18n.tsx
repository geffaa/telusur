"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { messages, type MessageKey } from "./i18n/messages";

export type Locale = "en" | "id";
export const LOCALES: Locale[] = ["en", "id"];
const STORAGE_KEY = "telusur.locale";

// Read by non-React helpers (date formatting, API headers) so they follow the same choice.
let current: Locale = "en";
export const currentLocale = () => current;
export const intlLocale = () => (current === "id" ? "id-ID" : "en-US");

type Vars = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = messages[locale][key] ?? messages.en[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : template;
}

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "id") setLocaleState(saved);
    } catch {
      // Storage can be unavailable (private mode); English stays the default.
    }
  }, []);

  useEffect(() => {
    current = locale;
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    current = l;
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  }, []);

  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );
  // Keep the module-level locale in sync during this render too, so formatters agree.
  current = locale;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useT() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useT must be used inside <I18nProvider>");
  return ctx;
}

/** Ingestion errors are stored as codes; older rows may still hold plain text. */
export function docErrorText(error: string | null | undefined, t: I18n["t"]): string {
  if (!error) return "";
  const key = `docError.${error}`;
  return key in messages.en ? t(key as MessageKey) : error;
}
