import { useI18n } from "../i18n/I18nProvider";
import { formatMetricValue } from "../utils/format";

export interface MetricCardProps {
  title: string;
  value?: number | null | undefined;
  unit?: string | undefined;
  precision?: string | undefined;
  confidence?: string | undefined;
  source?: string | undefined;
}

export function MetricCard({
  title,
  value,
  unit,
  precision,
  confidence,
  source
}: MetricCardProps) {
  const { t } = useI18n();
  const isMissing = value === null || value === undefined || Number.isNaN(value);

  return (
    <section className="metric-card" aria-label={title}>
      <div className="metric-card__title">{title}</div>
      <div className={isMissing ? "metric-card__value is-muted" : "metric-card__value"}>
        {formatMetricValue(value, unit)}
      </div>
      <div className="metric-card__meta">
        <span>{t("common.source")}: {source ?? t("common.na")}</span>
        <span>{t("common.precision")}: {precision ?? t("common.na")}</span>
        <span>{t("common.confidence")}: {confidence ?? t("common.na")}</span>
      </div>
    </section>
  );
}
