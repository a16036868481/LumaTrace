import { useI18n } from "../i18n/I18nProvider";

const issueUrl = "https://github.com/a16036868481/LumaTrace/issues";

export function BugReportPanel() {
  const { t } = useI18n();

  return (
    <section className="panel support-panel" aria-label={t("support.title")}>
      <div>
        <p className="eyebrow">{t("support.eyebrow")}</p>
        <h2>{t("support.title")}</h2>
        <p>{t("support.body")}</p>
      </div>
      <div className="summary-row">
        <a className="button button-secondary" href={issueUrl} rel="noreferrer" target="_blank">
          {t("support.openIssues")}
        </a>
        <span className="status-pill">{t("support.githubIssues")}</span>
      </div>
      <p className="notice-text">{t("support.include")}</p>
      <p className="notice-text">{t("support.privacy")}</p>
    </section>
  );
}
