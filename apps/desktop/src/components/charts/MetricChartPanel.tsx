import { useEffect, useRef, useState } from "react";
import { CHART_METRIC_NAMES, type ChartMetricName, type MetricSeriesState } from "../../utils/metricSeries";
import { DEFAULT_CHART_MAX_POINTS } from "../../utils/chartOptions";
import { useI18n } from "../../i18n/I18nProvider";
import { RealtimeMetricChart } from "./RealtimeMetricChart";
import { ChartToolbar } from "./ChartToolbar";

const units: Record<ChartMetricName, string> = {
  fps: "fps",
  frame_time_ms: "ms",
  cpu_percent: "%",
  memory_mb: "MB"
};

const labelKeys: Record<ChartMetricName, "metric.fps" | "metric.frameTime" | "metric.cpu" | "metric.memory"> = {
  fps: "metric.fps",
  frame_time_ms: "metric.frameTime",
  cpu_percent: "metric.cpu",
  memory_mb: "metric.memory"
};

export interface MetricChartPanelProps {
  seriesState: MetricSeriesState;
  onClear: () => void;
}

export function MetricChartPanel({ seriesState, onClear }: MetricChartPanelProps) {
  const { t } = useI18n();
  const [maxPoints, setMaxPoints] = useState(DEFAULT_CHART_MAX_POINTS);
  const [paused, setPaused] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<Record<ChartMetricName, boolean>>({
    fps: true,
    frame_time_ms: true,
    cpu_percent: true,
    memory_mb: true
  });
  const frozenSeriesRef = useRef<MetricSeriesState>(seriesState);
  useEffect(() => {
    if (!paused) {
      frozenSeriesRef.current = seriesState;
    }
  }, [paused, seriesState]);
  const shownSeries = paused ? frozenSeriesRef.current : seriesState;
  const bufferSize = Object.values(seriesState).reduce((total, series) => total + series.length, 0);

  return (
    <section className="panel">
      <h2>{t("chart.realtimeCharts")}</h2>
      <ChartToolbar
        maxPoints={maxPoints}
        paused={paused}
        visibleMetrics={visibleMetrics}
        bufferSize={bufferSize}
        onMaxPointsChange={setMaxPoints}
        onPausedChange={setPaused}
        onClear={onClear}
        onMetricVisibilityChange={(metricName, visible) =>
          setVisibleMetrics((current) => ({
            ...current,
            [metricName]: visible
          }))
        }
      />
      <div className="chart-grid">
        {CHART_METRIC_NAMES.filter((metricName) => visibleMetrics[metricName]).map((metricName) => (
          <RealtimeMetricChart
            key={metricName}
            title={t(labelKeys[metricName])}
            unit={units[metricName]}
            series={shownSeries[metricName] ?? []}
            maxPoints={maxPoints}
            paused={paused}
          />
        ))}
      </div>
    </section>
  );
}
