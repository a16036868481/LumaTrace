import type { MetricAvailability } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

const labelKeys: Record<MetricAvailability["status"], `availability.${MetricAvailability["status"]}`> = {
  available: "availability.available",
  unavailable: "availability.unavailable",
  requires_tool: "availability.requires_tool",
  requires_permission: "availability.requires_permission",
  experimental: "availability.experimental"
};

export function AvailabilityBadge({ availability }: { availability: MetricAvailability }) {
  const { t } = useI18n();
  return (
    <span className={`availability-badge availability-badge--${availability.status}`}>
      {availability.metricName}: {t(labelKeys[availability.status])}
    </span>
  );
}
