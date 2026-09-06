import { describe, expect, it } from "vitest";
import { buildReportLocalization } from "../src/i18n/reportLocalization";
import {
  loadTranslations,
  locales,
  rtlLocales,
  type TranslationKey
} from "../src/i18n/translations";

describe("report localization", () => {
  it("builds a complete HTML report dictionary for every selectable language", async () => {
    for (const locale of locales) {
      const dictionary = await loadTranslations(locale);
      const localization = buildReportLocalization(
        locale,
        (key: TranslationKey) => dictionary[key]
      );

      expect(localization.locale).toBe(locale);
      expect(
        Object.values(localization.strings).every((value) => value.trim().length > 0),
        locale
      ).toBe(true);
      expect(
        Object.values(localization.summaryLabels).every((value) => value.trim().length > 0),
        locale
      ).toBe(true);
      expect(localization.strings.title, locale).toBe(dictionary["report.title"]);
    }
  }, 120_000);

  it("marks every runtime right-to-left report as right-to-left", async () => {
    const runtimeRtlLocales = locales.filter((locale) => rtlLocales.has(locale));

    for (const locale of runtimeRtlLocales) {
      const dictionary = await loadTranslations(locale);
      const localization = buildReportLocalization(
        locale,
        (key: TranslationKey) => dictionary[key]
      );

      expect(localization.direction, locale).toBe("rtl");
    }
  });
});
