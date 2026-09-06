import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import {
  localeEnglishNames,
  localeLabels,
  locales,
  type Locale
} from "../i18n/translations";

export function LanguageSelector() {
  const { locale, localeLoadError, loadingLocale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeLocale, setActiveLocale] = useState<Locale | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<Locale, HTMLButtonElement>());
  const labelId = useId();
  const listboxId = useId();
  const errorId = useId();
  const visibleLocale = locale;
  const filteredLocales = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return locales;
    }
    return locales.filter((item) =>
      [item, localeLabels[item], localeEnglishNames[item]].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [query]);

  const optionId = (item: Locale) => `${listboxId}-option-${item}`;

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
    setActiveLocale(null);
  };

  const openMenu = () => {
    setOpen(true);
    setQuery("");
    setActiveLocale(locale);
  };

  const moveActiveLocale = (position: "next" | "previous" | "first" | "last") => {
    if (filteredLocales.length === 0) {
      setActiveLocale(null);
      return;
    }
    if (position === "first" || position === "last") {
      setActiveLocale(filteredLocales[position === "first" ? 0 : filteredLocales.length - 1] ?? null);
      return;
    }
    const currentIndex = activeLocale === null ? -1 : filteredLocales.indexOf(activeLocale);
    const nextIndex =
      currentIndex === -1
        ? position === "next"
          ? 0
          : filteredLocales.length - 1
        : (currentIndex + (position === "next" ? 1 : -1) + filteredLocales.length) %
          filteredLocales.length;
    setActiveLocale(filteredLocales[nextIndex] ?? null);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (filteredLocales.length === 0) {
      setActiveLocale(null);
      return;
    }
    if (activeLocale === null || !filteredLocales.includes(activeLocale)) {
      setActiveLocale(filteredLocales[0] ?? null);
    }
  }, [activeLocale, filteredLocales, open]);

  useEffect(() => {
    if (!open || activeLocale === null) {
      return;
    }
    optionRefs.current.get(activeLocale)?.scrollIntoView?.({ block: "nearest" });
  }, [activeLocale, open]);

  const chooseLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    closeMenu();
    triggerRef.current?.focus();
  };

  return (
    <div
      className="language-selector"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          closeMenu();
          triggerRef.current?.focus();
          return;
        }
        if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          openMenu();
          return;
        }
        if (!open) {
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveActiveLocale(event.key === "ArrowDown" ? "next" : "previous");
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          moveActiveLocale(event.key === "Home" ? "first" : "last");
          return;
        }
        const eventTarget = event.target as HTMLElement;
        const targetsOption = eventTarget.closest('[role="option"]') !== null;
        const isSearchSpace = event.key === " " && eventTarget.matches('input[type="search"]');
        if (
          (event.key === "Enter" || event.key === " ") &&
          !targetsOption &&
          !isSearchSpace &&
          activeLocale !== null
        ) {
          event.preventDefault();
          chooseLocale(activeLocale);
        }
      }}
    >
      <span id={labelId}>{t("language.label")}</span>
      <button
        aria-busy={loadingLocale !== null}
        aria-controls={listboxId}
        aria-describedby={localeLoadError === null ? undefined : errorId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open && activeLocale !== null ? optionId(activeLocale) : undefined}
        aria-labelledby={labelId}
        className="language-selector__trigger"
        ref={triggerRef}
        role="combobox"
        type="button"
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
      >
        <strong>{localeLabels[visibleLocale]}</strong>
        {loadingLocale !== null ? (
          <span aria-hidden="true" className="language-selector__loading" />
        ) : (
          <span aria-hidden="true" className="language-selector__chevron" />
        )}
      </button>
      {open ? (
        <div className="language-selector__menu">
          <input
            aria-activedescendant={activeLocale === null ? undefined : optionId(activeLocale)}
            aria-controls={listboxId}
            aria-label={t("language.label")}
            aria-expanded="true"
            aria-haspopup="listbox"
            className="language-selector__search"
            placeholder={`${t("language.label")}…`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div aria-labelledby={labelId} id={listboxId} role="listbox">
            {filteredLocales.map((item) => (
              <button
                aria-selected={item === locale}
                className={`${item === locale ? "is-selected" : ""}${item === activeLocale ? " is-active" : ""}`.trim() || undefined}
                id={optionId(item)}
                key={item}
                role="option"
                tabIndex={-1}
                type="button"
                ref={(element) => {
                  if (element === null) {
                    optionRefs.current.delete(item);
                  } else {
                    optionRefs.current.set(item, element);
                  }
                }}
                onFocus={() => setActiveLocale(item)}
                onMouseMove={() => setActiveLocale(item)}
                onClick={() => chooseLocale(item)}
              >
                <span>
                  <strong>{localeLabels[item]}</strong>
                  <small>{localeEnglishNames[item] === localeLabels[item] ? item : localeEnglishNames[item]}</small>
                </span>
                {item === locale ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {localeLoadError !== null ? (
        <div className="language-selector__error" id={errorId} role="alert">
          <span>{`${localeLabels[localeLoadError] ?? localeLoadError} — ${t("common.error")}`}</span>
          <button type="button" onClick={() => setLocale(localeLoadError)}>
            {t("session.fpsAccessRecheck")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
