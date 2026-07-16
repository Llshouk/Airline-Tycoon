"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { en } from "@/i18n/en";
import { zh } from "@/i18n/zh";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/gameSaveStorage";

export type Language = "en" | "zh";
export type TranslationKey = keyof typeof en;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, zh };
const STORAGE_KEY = "airline-tycoon-language";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = safeGetLocalStorage(STORAGE_KEY);
    if (stored === "en" || stored === "zh") setLanguageState(stored);
  }, []);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    safeSetLocalStorage(STORAGE_KEY, nextLanguage);
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => dictionaries[language][key] ?? en[key] ?? key
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useTranslation must be used inside I18nProvider");
  return value;
}
