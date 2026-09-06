import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  defaultTranslations,
  getCachedTranslations,
  loadTranslations,
  locales,
  rtlLocales,
  type Locale,
  type TranslationDictionary,
  type TranslationKey
} from "./translations";

interface I18nContextValue {
  locale: Locale;
  localeLoadError: Locale | null;
  loadingLocale: Locale | null;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const localeStorageKey = "lumatrace.locale";

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: string | null | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

function readStoredLocale(): string | null {
  try {
    return typeof window.localStorage?.getItem === "function"
      ? window.localStorage.getItem(localeStorageKey)
      : null;
  } catch {
    return null;
  }
}

function storeLocale(locale: Locale): void {
  try {
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(localeStorageKey, locale);
    }
  } catch {
    // Locale selection still works when persistent browser storage is unavailable.
  }
}

function clearStoredLocale(locale: Locale): void {
  try {
    if (
      typeof window.localStorage?.removeItem === "function" &&
      window.localStorage.getItem(localeStorageKey) === locale
    ) {
      window.localStorage.removeItem(localeStorageKey);
    }
  } catch {
    // A failed local chunk still falls back to the active language when storage is unavailable.
  }
}

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "en-US";
  }
  const stored = readStoredLocale();
  if (isLocale(stored)) {
    return stored;
  }
  return "en-US";
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
  const initialLocale = useRef(detectInitialLocale()).current;
  const requestId = useRef(0);
  const [active, setActive] = useState<{
    locale: Locale;
    dictionary: TranslationDictionary;
  }>({ locale: "en-US", dictionary: defaultTranslations });
  const [loadingLocale, setLoadingLocale] = useState<Locale | null>(
    initialLocale === "en-US" ? null : initialLocale
  );
  const [localeLoadError, setLocaleLoadError] = useState<Locale | null>(null);

  const activateLocale = useCallback((nextLocale: Locale) => {
    const nextRequestId = requestId.current + 1;
    requestId.current = nextRequestId;
    setLocaleLoadError(null);
    const cached = getCachedTranslations(nextLocale);
    if (cached !== undefined) {
      setActive({ locale: nextLocale, dictionary: cached });
      setLoadingLocale(null);
      storeLocale(nextLocale);
      return;
    }
    setLoadingLocale(nextLocale);
    void loadTranslations(nextLocale)
      .then((dictionary) => {
        if (requestId.current !== nextRequestId) {
          return;
        }
        setActive({ locale: nextLocale, dictionary });
        setLoadingLocale(null);
        storeLocale(nextLocale);
      })
      .catch(() => {
        if (requestId.current === nextRequestId) {
          setLoadingLocale(null);
          setLocaleLoadError(nextLocale);
          clearStoredLocale(nextLocale);
        }
      });
  }, []);

  useEffect(() => {
    activateLocale(initialLocale);
  }, [activateLocale, initialLocale]);

  useEffect(() => {
    document.documentElement.lang = active.locale;
    document.documentElement.dir = rtlLocales.has(active.locale) ? "rtl" : "ltr";
  }, [active.locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: active.locale,
      localeLoadError,
      loadingLocale,
      setLocale: activateLocale,
      t: (key, values) => formatTemplate(active.dictionary[key] ?? defaultTranslations[key], values)
    }),
    [active, activateLocale, loadingLocale, localeLoadError]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) {
    return {
      locale: "en-US",
      localeLoadError: null,
      loadingLocale: null,
      setLocale: () => undefined,
      t: (key, values) => formatTemplate(defaultTranslations[key], values)
    };
  }
  return value;
}
