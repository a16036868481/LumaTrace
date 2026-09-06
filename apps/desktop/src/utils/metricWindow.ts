import type { MetricSeriesPoint, MetricSeriesState } from "./metricSeries";

export type MetricWindow = "30s" | "1m" | "5m" | "all";

export const metricWindowOptions: Array<{ value: MetricWindow; label: string }> = [
  { value: "30s", label: "Last 30 seconds" },
  { value: "1m", label: "Last 1 minute" },
  { value: "5m", label: "Last 5 minutes" },
  { value: "all", label: "All local buffer" }
];

function durationForWindow(window: MetricWindow): number | null {
  if (window === "30s") {
    return 30_000;
  }
  if (window === "1m") {
    return 60_000;
  }
  if (window === "5m") {
    return 300_000;
  }
  return null;
}

export function filterSeriesByWindow(
  series: MetricSeriesPoint[],
  window: MetricWindow,
  nowMs?: number
): MetricSeriesPoint[] {
  const sorted = [...series].sort((a, b) => a.timestampMs - b.timestampMs);
  const duration = durationForWindow(window);
  if (duration === null) {
    return sorted;
  }
  const reference = nowMs ?? sorted[sorted.length - 1]?.timestampMs ?? Date.now();
  const cutoff = reference - duration;
  return sorted.filter((point) => point.timestampMs >= cutoff && point.timestampMs <= reference);
}

export function filterSeriesStateByWindow(
  state: MetricSeriesState,
  window: MetricWindow,
  nowMs?: number
): MetricSeriesState {
  return Object.fromEntries(
    Object.entries(state).map(([metricName, series]) => [
      metricName,
      filterSeriesByWindow(series, window, nowMs)
    ])
  );
}
