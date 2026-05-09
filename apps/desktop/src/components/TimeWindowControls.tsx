import { metricWindowOptions, type MetricWindow } from "../utils/metricWindow";
import { useI18n } from "../i18n/I18nProvider";

const windowLabelKeys: Record<MetricWindow, "chart.last30s" | "chart.last1m" | "chart.last5m" | "chart.allBuffer"> = {
  "30s": "chart.last30s",
  "1m": "chart.last1m",
  "5m": "chart.last5m",
  all: "chart.allBuffer"
};

export function TimeWindowControls({
  value,
  onChange
}: {
  value: MetricWindow;
  onChange: (value: MetricWindow) => void;
}) {
  const { t } = useI18n();

  return (
    <label className="filter-control">
      {t("chart.timeWindow")}
      <select value={value} onChange={(event) => onChange(event.target.value as MetricWindow)}>
        {metricWindowOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(windowLabelKeys[option.value])}
          </option>
        ))}
      </select>
    </label>
  );
}
