import type { ChartMetricName } from "../../utils/metricSeries";
import { useI18n } from "../../i18n/I18nProvider";

export interface ChartToolbarProps {
  maxPoints: number;
  paused: boolean;
  visibleMetrics: Record<ChartMetricName, boolean>;
  bufferSize: number;
  onMaxPointsChange: (value: number) => void;
  onPausedChange: (value: boolean) => void;
  onClear: () => void;
  onMetricVisibilityChange: (metricName: ChartMetricName, visible: boolean) => void;
}

const labelKeys: Record<ChartMetricName, "metric.fps" | "metric.frameTime" | "metric.cpu" | "metric.memory"> = {
  fps: "metric.fps",
  frame_time_ms: "metric.frameTime",
  cpu_percent: "metric.cpu",
  memory_mb: "metric.memory"
};

export function ChartToolbar({
  maxPoints,
  paused,
  visibleMetrics,
  bufferSize,
  onMaxPointsChange,
  onPausedChange,
  onClear,
  onMetricVisibilityChange
}: ChartToolbarProps) {
  const { t } = useI18n();

  return (
    <div className="chart-toolbar">
      <label>
        {t("chart.maxPoints")}
        <select value={maxPoints} onChange={(event) => onMaxPointsChange(Number(event.target.value))}>
          <option value={100}>100</option>
          <option value={300}>300</option>
          <option value={1000}>1000</option>
        </select>
      </label>
      <button className="button button-secondary" type="button" onClick={() => onPausedChange(!paused)}>
        {paused ? t("chart.resume") : t("chart.pause")}
      </button>
      <button className="button button-secondary" type="button" onClick={onClear}>
        {t("chart.clearBuffer")}
      </button>
      <span className="status-pill">{t("chart.buffer")}: {bufferSize}</span>
      <div className="chart-toolbar__toggles">
        {(Object.keys(labelKeys) as ChartMetricName[]).map((metricName) => (
          <label key={metricName} className="checkbox-label">
            <input
              checked={visibleMetrics[metricName]}
              type="checkbox"
              onChange={(event) => onMetricVisibilityChange(metricName, event.target.checked)}
            />
            {t(labelKeys[metricName])}
          </label>
        ))}
      </div>
    </div>
  );
}
