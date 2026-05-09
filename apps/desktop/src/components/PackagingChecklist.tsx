import { useI18n } from "../i18n/I18nProvider";

export function PackagingChecklist() {
  const { t } = useI18n();

  return (
    <section className="panel" aria-label="Packaging QA checklist">
      <h2>{t("packaging.checklist")}</h2>
      <ul>
        <li>{t("packaging.check1")}</li>
        <li>{t("packaging.check2")}</li>
        <li>{t("packaging.check3")}</li>
        <li>{t("packaging.check4")}</li>
        <li>{t("packaging.check5")}</li>
        <li>{t("packaging.check6")}</li>
        <li>{t("packaging.check7")}</li>
        <li>{t("packaging.check8")}</li>
        <li>{t("packaging.check9")}</li>
      </ul>
    </section>
  );
}
