import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { locales, translations, type Locale, type TranslationKey } from "./translations";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const localeStorageKey = "lumatrace.locale";

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: string | null | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "zh-CN";
  }
  const stored = window.localStorage.getItem(localeStorageKey);
  if (isLocale(stored)) {
    return stored;
  }
  const preferred = window.navigator.languages?.[0] ?? window.navigator.language;
  if (preferred.startsWith("ja")) {
    return "ja-JP";
  }
  if (preferred.startsWith("ko")) {
    return "ko-KR";
  }
  if (preferred.startsWith("en")) {
    return "en-US";
  }
  return "zh-CN";
}

function formatTemplate(template: string, values?: Record<string, string | number>): string {
  if (values === undefined) {
    return template;
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key, values) => formatTemplate(translations[locale][key] ?? translations["en-US"][key], values)
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) {
    return {
      locale: "en-US",
      setLocale: () => undefined,
      t: (key, values) => formatTemplate(translations["en-US"][key], values)
    };
  }
  return value;
}
