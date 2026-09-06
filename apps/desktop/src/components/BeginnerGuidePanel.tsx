import { navigateTo } from "../app/routes";
import { useI18n } from "../i18n/I18nProvider";

export function BeginnerGuidePanel() {
  const { t } = useI18n();

  return (
    <section className="panel guide-panel" aria-label={t("guide.title")}>
      <div className="guide-panel__header">
        <div>
          <p className="eyebrow">{t("common.quickStart")}</p>
          <h2>{t("guide.title")}</h2>
          <p>{t("guide.subtitle")}</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => navigateTo("/session")}
        >
          {t("guide.primaryAction")}
        </button>
      </div>

      <div className="guide-grid">
        <article className="guide-card">
          <span className="status-pill availability-badge--available">{t("guide.realBadge")}</span>
          <h3>{t("guide.pcTitle")}</h3>
          <p>{t("guide.pcBody")}</p>
        </article>
        <article className="guide-card">
          <span className="status-pill availability-badge--experimental">
            {t("guide.androidBadge")}
          </span>
          <h3>{t("guide.androidTitle")}</h3>
          <p>{t("guide.androidBody")}</p>
        </article>
      </div>

      <div className="guide-terms">
        <h3>{t("guide.conceptsTitle")}</h3>
        <ul>
          <li>{t("guide.deviceConcept")}</li>
          <li>{t("guide.targetConcept")}</li>
          <li>{t("guide.sessionConcept")}</li>
        </ul>
      </div>
    </section>
  );
}
