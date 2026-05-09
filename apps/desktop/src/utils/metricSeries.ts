import type { MetricEvent } from "../api/types";

export const CHART_METRIC_NAMES = ["fps", "frame_time_ms", "cpu_percent", "memory_mb"] as const;

export type ChartMetricName = (typeof CHART_METRIC_NAMES)[number];

export interface MetricSeriesPoint {
  timestampMs: number;
  value: number | null;
  source?: string;
  precision?: string;
  confidence?: string;
  sequence?: number;
}

export type MetricSeriesState = Record<string, MetricSeriesPoint[]>;

export interface AppendMetricOptions {
  maxPoints?: number;
}

export function normalizeMetricValue(event: MetricEvent): number | null {
  if (event.metricName === "cpu_percent" && typeof event.tags?.normalizedPercent === "number") {
    return event.tags.normalizedPercent;
  }
  return event.value;
}

export function trimSeries<T>(series: T[], maxPoints: number): T[] {
  if (series.length <= maxPoints) {
    return series;
  }
  return series.slice(series.length - maxPoints);
}

function compareEvents(a: MetricEvent, b: MetricEvent): number {
  if (a.timestampMs !== b.timestampMs) {
    return a.timestampMs - b.timestampMs;
  }
  return (a.sequence ?? 0) - (b.sequence ?? 0);
}

function comparePoints(a: MetricSeriesPoint, b: MetricSeriesPoint): number {
  if (a.timestampMs !== b.timestampMs) {
    return a.timestampMs - b.timestampMs;
  }
  return (a.sequence ?? 0) - (b.sequence ?? 0);
}

export function groupMetricEventsByName(events: MetricEvent[]): Record<string, MetricEvent[]> {
  const grouped: Record<string, MetricEvent[]> = {};
  for (const event of [...events].sort(compareEvents)) {
    grouped[event.metricName] ??= [];
    grouped[event.metricName]?.push(event);
  }
  return grouped;
}

export function getLatestMetricByName(events: MetricEvent[], metricName: string): MetricEvent | null {
  const matching = events
    .filter((event) => event.metricName === metricName)
    .sort(compareEvents);
  return matching.at(-1) ?? null;
}

export function appendMetricEventToSeries(
  state: MetricSeriesState,
  event: MetricEvent,
  options: AppendMetricOptions = {}
): MetricSeriesState {
  if (!CHART_METRIC_NAMES.includes(event.metricName as ChartMetricName)) {
    return state;
  }

  const point: MetricSeriesPoint = {
    timestampMs: event.timestampMs,
    value: normalizeMetricValue(event)
  };
  if (event.source !== undefined) {
    point.source = event.source;
  }
  if (event.precision !== undefined) {
    point.precision = event.precision;
  }
  if (event.confidence !== undefined) {
    point.confidence = event.confidence;
  }
  if (event.sequence !== undefined) {
    point.sequence = event.sequence;
  }

  const nextSeries = [...(state[event.metricName] ?? []), point].sort(comparePoints);
  return {
    ...state,
    [event.metricName]: trimSeries(nextSeries, options.maxPoints ?? 300)
  };
}
