import { METRIC_NAMES, type MetricEvent } from "@lumatrace/core";

export function sortMetrics(metrics: readonly MetricEvent[]): MetricEvent[] {
  return [...metrics].sort((left, right) => {
    const timestampDelta = left.timestampMs - right.timestampMs;
    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
    const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
    const sequenceDelta = leftSequence - rightSequence;
    if (sequenceDelta !== 0) {
      return sequenceDelta;
    }

    return left.metricName.localeCompare(right.metricName);
  });
}

export function metricValues(metrics: readonly MetricEvent[], metricName: string): number[] {
  return metrics
    .filter((event) => event.metricName === metricName && event.value !== null)
    .map((event) => event.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
}

export function cpuMetricValues(metrics: readonly MetricEvent[]): number[] {
  return metrics
    .filter((event) => event.metricName === METRIC_NAMES.CPU_PERCENT)
    .map((event) => {
      if (typeof event.tags?.normalizedPercent === "number") {
        return event.tags.normalizedPercent;
      }

      return event.value;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function inferRefreshRate(metrics: readonly MetricEvent[]): number | undefined {
  for (const event of metrics) {
    if (typeof event.tags?.refreshRate === "number" && Number.isFinite(event.tags.refreshRate)) {
      return event.tags.refreshRate;
    }
  }

  return undefined;
}

export function hasMetric(metrics: readonly MetricEvent[], metricName: string): boolean {
  return metrics.some((event) => event.metricName === metricName && event.value !== null);
}
