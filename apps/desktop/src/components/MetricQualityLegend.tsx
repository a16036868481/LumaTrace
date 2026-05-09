import { useI18n } from "../i18n/I18nProvider";

export function MetricQualityLegend() {
  const { t } = useI18n();

  return (
    <section className="panel quality-legend" aria-label={t("metricQuality.aria")}>
      <h2>{t("metricQuality.title")}</h2>
      <div className="badge-row">
        <span className="status-pill">{t("metricQuality.source")}</span>
        <span className="status-pill">{t("metricQuality.precision")}</span>
        <span className="status-pill">{t("metricQuality.confidence")}</span>
      </div>
      <p>{t("metricQuality.body")}</p>
    </section>
  );
}
