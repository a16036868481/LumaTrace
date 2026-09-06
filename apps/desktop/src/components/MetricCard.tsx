import type { MetricAvailabilityStatus } from "@lumatrace/core";
import { useI18n } from "../i18n/I18nProvider";
import { formatMetricValue } from "../utils/format";

export interface MetricCardProps {
  title: string;
  value?: number | null | undefined;
  unit?: string | undefined;
  icon?: string | undefined;
  description?: string | undefined;
  variant?: "default" | "featured" | "compact" | undefined;
  metadataMode?: "visible" | "details" | undefined;
  missingValueLabel?: string | undefined;
  precision?: string | undefined;
  confidence?: string | undefined;
  source?: string | undefined;
  availability?: MetricAvailabilityStatus | undefined;
}

export function MetricCard({
  title,
  value,
  unit,
  icon,
  description,
  variant = "default",
  metadataMode = "visible",
  missingValueLabel,
  precision,
  confidence,
  source,
  availability
}: MetricCardProps) {
  const { t } = useI18n();
  const isMissing = value === null || value === undefined || Number.isNaN(value);
  const effectiveAvailability = availability ?? (isMissing ? "unavailable" : "available");
  const availabilityLabel =
    effectiveAvailability === "available"
      ? t("availability.available")
      : effectiveAvailability === "requires_tool"
        ? t("availability.requires_tool")
        : effectiveAvailability === "requires_permission"
          ? t("availability.requires_permission")
          : effectiveAvailability === "experimental"
            ? t("availability.experimental")
            : t("availability.unavailable");

  const metadata = (
    <div className="metric-card__meta">
      <span>{t("common.status")}: {availabilityLabel}</span>
      <span>{t("common.source")}: {source ?? t("common.na")}</span>
      <span>{t("common.precision")}: {precision ?? t("common.na")}</span>
      <span>{t("common.confidence")}: {confidence ?? t("common.na")}</span>
    </div>
  );

  return (
    <section
      className={`metric-card metric-card--${variant}${isMissing ? " is-unavailable" : ""}`}
      aria-label={title}
    >
      <div className="metric-card__heading">
        {icon !== undefined ? <span className="metric-card__icon" aria-hidden="true">{icon}</span> : null}
        <div>
          <div className="metric-card__title">{title}</div>
          {description !== undefined ? <div className="metric-card__description">{description}</div> : null}
        </div>
      </div>
      <div className={isMissing ? "metric-card__value is-muted" : "metric-card__value"}>
        {isMissing && missingValueLabel !== undefined
          ? missingValueLabel
          : formatMetricValue(value, unit)}
      </div>
      {metadataMode === "details" ? (
        <details className="metric-card__quality">
          <summary>{t("common.details")}</summary>
          {metadata}
        </details>
      ) : metadata}
    </section>
  );
}
