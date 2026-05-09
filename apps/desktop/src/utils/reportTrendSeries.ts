import type { DownsampledMetricBucket, MetricEvent } from "../api/types";
import {
  appendMetricEventToSeries,
  CHART_METRIC_NAMES,
  normalizeMetricValue,
  type ChartMetricName,
  type MetricSeriesPoint,
  type MetricSeriesState
} from "./metricSeries";

export const REPORT_TREND_UNITS: Record<ChartMetricName, string> = {
  fps: "fps",
  frame_time_ms: "ms",
  cpu_percent: "%",
  memory_mb: "MB"
};

export function isChartMetricName(metricName: string): metricName is ChartMetricName {
  return CHART_METRIC_NAMES.includes(metricName as ChartMetricName);
}

export function buildReportTrendSeriesFromRawMetrics(metrics: readonly MetricEvent[]): MetricSeriesState {
  return metrics.reduce<MetricSeriesState>((state, metric) => appendMetricEventToSeries(state, metric), {});
}

export function bucketToTrendPoint(bucket: DownsampledMetricBucket): MetricSeriesPoint | null {
  if (!isChartMetricName(bucket.metricName) || typeof bucket.avgValue !== "number" || !Number.isFinite(bucket.avgValue)) {
    return null;
  }

  const point: MetricSeriesPoint = {
    timestampMs: Math.round((bucket.bucketStartMs + bucket.bucketEndMs) / 2),
    value: bucket.avgValue,
    source: bucket.source ?? "downsampled",
    sequence: bucket.bucketStartMs
  };
  if (bucket.precision !== undefined) {
    point.precision = bucket.precision;
  }
  return point;
}

export function buildReportTrendSeriesFromBuckets(buckets: readonly DownsampledMetricBucket[]): MetricSeriesState {
  const state: MetricSeriesState = {};
  for (const bucket of buckets) {
    const point = bucketToTrendPoint(bucket);
    if (point === null) {
      continue;
    }
    state[bucket.metricName] ??= [];
    state[bucket.metricName]?.push(point);
  }
  for (const metricName of Object.keys(state)) {
    state[metricName]?.sort((left, right) => {
      if (left.timestampMs !== right.timestampMs) {
        return left.timestampMs - right.timestampMs;
      }
      return (left.sequence ?? 0) - (right.sequence ?? 0);
    });
  }
  return state;
}

export function hasNumericTrendMetrics(metrics: readonly MetricEvent[]): boolean {
  return metrics.some((metric) => isChartMetricName(metric.metricName) && normalizeMetricValue(metric) !== null);
}
