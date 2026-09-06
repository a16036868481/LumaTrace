import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageSelector } from "../src/components/LanguageSelector";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider";
import { localeLabels, locales, type Locale } from "../src/i18n/translations";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function FailureHarness() {
  const { setLocale } = useI18n();
  return (
    <>
      <LanguageSelector />
      <button type="button" onClick={() => setLocale("missing-test-locale" as Locale)}>
        Load missing locale
      </button>
      <button type="button" onClick={() => setLocale("en-US")}>
        Load English
      </button>
    </>
  );
}

describe("LanguageSelector", () => {
  it("supports active-descendant keyboard navigation and selection", async () => {
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>
    );

    const trigger = screen.getByRole("combobox", { name: "Language" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(locales.length);
    expect(trigger.getAttribute("aria-activedescendant")).toBe(options[0]?.id);

    fireEvent.keyDown(trigger, { key: "End" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe(options.at(-1)?.id);

    fireEvent.keyDown(trigger, { key: "Home" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe(options[0]?.id);

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe(options[1]?.id);
    fireEvent.keyDown(trigger, { key: "Enter" });

    await waitFor(() => expect(trigger.textContent).toContain(localeLabels[locales[1]!]));
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    fireEvent.keyDown(trigger, { key: " " });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("shows a retryable localized load error and clears it for a new selection", async () => {
    render(
      <I18nProvider>
        <FailureHarness />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Load missing locale" }));
    expect((await screen.findByRole("alert")).textContent).toContain("missing-test-locale — Error");
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load English" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
