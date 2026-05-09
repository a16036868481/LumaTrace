import type { MetricEvent } from "../models/MetricEvent";
import type { ReportSummary } from "../models/ReportSummary";
import { METRIC_NAMES } from "../metrics/metricNames";
import { summarizeBattery, type BatteryLevelSample } from "./battery";
import { summarizeCpu } from "./cpu";
import { summarizeFps, type FpsSummaryInput } from "./fps";
import { summarizeMemory } from "./memory";
import { summarizeNetworkDeltas, type NetworkDelta } from "./network";

export interface ReportSummaryInput {
  events: readonly MetricEvent[];
  startedAt?: number;
  endedAt?: number;
  refreshRate?: number;
}

function numericValues(events: readonly MetricEvent[], metricName: string): number[] {
  return events
    .filter((event) => event.metricName === metricName && event.value !== null)
    .map((event) => event.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
}

function calculateDurationMs(events: readonly MetricEvent[], startedAt?: number, endedAt?: number): number {
  if (startedAt !== undefined && endedAt !== undefined && endedAt >= startedAt) {
    return endedAt - startedAt;
  }

  const timestamps = events.map((event) => event.timestampMs).filter((value) => Number.isFinite(value));
  if (timestamps.length < 2) {
    return 0;
  }

  return Math.max(...timestamps) - Math.min(...timestamps);
}

export function buildReportSummary(input: ReportSummaryInput): ReportSummary {
  const frameTimes = numericValues(input.events, METRIC_NAMES.FRAME_TIME_MS);
  const fpsSamples = numericValues(input.events, METRIC_NAMES.FPS);
  const cpuSamples = numericValues(input.events, METRIC_NAMES.CPU_PERCENT);
  const memorySamples = numericValues(input.events, METRIC_NAMES.MEMORY_MB);
  const batterySamples: BatteryLevelSample[] = input.events
    .filter((event) => event.metricName === METRIC_NAMES.BATTERY_LEVEL_PERCENT && event.value !== null)
    .map((event) => ({ timestampMs: event.timestampMs, levelPercent: event.value }))
    .filter((sample): sample is BatteryLevelSample => Number.isFinite(sample.levelPercent));
  const networkDeltas: NetworkDelta[] = [];

  const rxBytesEvents = input.events.filter(
    (event) => event.metricName === METRIC_NAMES.NETWORK_RX_BYTES && event.value !== null
  );
  const txBytesEvents = input.events.filter(
    (event) => event.metricName === METRIC_NAMES.NETWORK_TX_BYTES && event.value !== null
  );
  for (const rxEvent of rxBytesEvents) {
    const txEvent = txBytesEvents.find((event) => event.timestampMs === rxEvent.timestampMs);
    const intervalMs = typeof rxEvent.tags?.intervalMs === "number" ? rxEvent.tags.intervalMs : 1000;
    if (txEvent === undefined || txEvent.value === null || rxEvent.value === null) {
      continue;
    }

    networkDeltas.push({
      rxBytes: rxEvent.value,
      txBytes: txEvent.value,
      rxBytesPerSecond: intervalMs > 0 ? rxEvent.value / (intervalMs / 1000) : 0,
      txBytesPerSecond: intervalMs > 0 ? txEvent.value / (intervalMs / 1000) : 0,
      intervalMs
    });
  }
  if (networkDeltas.length === 0) {
    const rxRateEvents = input.events.filter(
      (event) =>
        (event.metricName === METRIC_NAMES.NETWORK_RX_RATE_BPS ||
          event.metricName === METRIC_NAMES.NETWORK_RX_BYTES_PER_SEC) &&
        event.value !== null
    );
    const txRateEvents = input.events.filter(
      (event) =>
        (event.metricName === METRIC_NAMES.NETWORK_TX_RATE_BPS ||
          event.metricName === METRIC_NAMES.NETWORK_TX_BYTES_PER_SEC) &&
        event.value !== null
    );
    for (const rxEvent of rxRateEvents) {
      const txEvent = txRateEvents.find((event) => event.timestampMs === rxEvent.timestampMs);
      const intervalMs = typeof rxEvent.tags?.intervalMs === "number" ? rxEvent.tags.intervalMs : 1000;
      if (txEvent === undefined || txEvent.value === null || rxEvent.value === null || intervalMs <= 0) {
        continue;
      }

      networkDeltas.push({
        rxBytes: rxEvent.value * (intervalMs / 1000),
        txBytes: txEvent.value * (intervalMs / 1000),
        rxBytesPerSecond: rxEvent.value,
        txBytesPerSecond: txEvent.value,
        intervalMs
      });
    }
  }

  const fpsInput: FpsSummaryInput = {
    frameTimesMs: frameTimes,
    fpsSamples
  };
  if (input.refreshRate !== undefined) {
    fpsInput.refreshRate = input.refreshRate;
  }

  const fpsSummary = summarizeFps(fpsInput);
  const summary: ReportSummary = {
    durationMs: calculateDurationMs(input.events, input.startedAt, input.endedAt)
  };

  if (fpsSummary.avgFps !== undefined) {
    summary.avgFps = fpsSummary.avgFps;
  }
  if (fpsSummary.minFps !== undefined) {
    summary.minFps = fpsSummary.minFps;
  }
  if (fpsSummary.maxFps !== undefined) {
    summary.maxFps = fpsSummary.maxFps;
  }
  if (fpsSummary.onePercentLowFps !== undefined) {
    summary.onePercentLowFps = fpsSummary.onePercentLowFps;
  }
  if (fpsSummary.zeroPointOnePercentLowFps !== undefined) {
    summary.zeroPointOnePercentLowFps = fpsSummary.zeroPointOnePercentLowFps;
  }
  if (fpsSummary.p50FrameTimeMs !== undefined) {
    summary.p50FrameTimeMs = fpsSummary.p50FrameTimeMs;
  }
  if (fpsSummary.p90FrameTimeMs !== undefined) {
    summary.p90FrameTimeMs = fpsSummary.p90FrameTimeMs;
  }
  if (fpsSummary.p95FrameTimeMs !== undefined) {
    summary.p95FrameTimeMs = fpsSummary.p95FrameTimeMs;
  }
  if (fpsSummary.p99FrameTimeMs !== undefined) {
    summary.p99FrameTimeMs = fpsSummary.p99FrameTimeMs;
  }
  summary.jankCount = fpsSummary.jankCount;
  summary.severeJankCount = fpsSummary.severeJankCount;

  return {
    ...summary,
    ...summarizeCpu(cpuSamples),
    ...summarizeMemory(memorySamples),
    ...summarizeNetworkDeltas(networkDeltas),
    ...summarizeBattery(batterySamples)
  };
}
