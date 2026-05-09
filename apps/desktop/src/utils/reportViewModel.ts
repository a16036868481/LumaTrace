import type { EventMarker, MetricEvent, ReportSummary, Session } from "../api/types";
import { formatDuration, formatMetricValue, formatNumber } from "./format";

export interface ReportSummaryItem {
  label: string;
  value: string;
}

export interface ReportViewModel {
  summaryItems: ReportSummaryItem[];
  markers: EventMarker[];
  sourceNotice: string;
  timeline: {
    startedAt?: number;
    endedAt?: number;
    markerCount: number;
    metricCount: number;
    metricStartMs?: number;
    metricEndMs?: number;
  };
}

function metricRange(metrics: MetricEvent[]): { metricStartMs?: number; metricEndMs?: number } {
  if (metrics.length === 0) {
    return {};
  }
  const timestamps = metrics.map((metric) => metric.timestampMs).sort((a, b) => a - b);
  const range: { metricStartMs?: number; metricEndMs?: number } = {};
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  if (first !== undefined) {
    range.metricStartMs = first;
  }
  if (last !== undefined) {
    range.metricEndMs = last;
  }
  return range;
}

export function buildSummaryItems(summary: ReportSummary): ReportSummaryItem[] {
  return [
    { label: "Duration", value: formatDuration(summary.durationMs) },
    { label: "Avg FPS", value: formatMetricValue(summary.avgFps, "fps") },
    { label: "Min FPS", value: formatMetricValue(summary.minFps, "fps") },
    { label: "Max FPS", value: formatMetricValue(summary.maxFps, "fps") },
    { label: "1% Low", value: formatMetricValue(summary.onePercentLowFps, "fps") },
    { label: "0.1% Low", value: formatMetricValue(summary.zeroPointOnePercentLowFps, "fps") },
    { label: "P50 Frame Time", value: formatMetricValue(summary.p50FrameTimeMs, "ms") },
    { label: "P95 Frame Time", value: formatMetricValue(summary.p95FrameTimeMs, "ms") },
    { label: "P99 Frame Time", value: formatMetricValue(summary.p99FrameTimeMs, "ms") },
    { label: "Jank Count", value: formatNumber(summary.jankCount, 0) },
    { label: "Severe Jank", value: formatNumber(summary.severeJankCount, 0) },
    { label: "Avg CPU", value: formatMetricValue(summary.avgCpuPercent, "%") },
    { label: "Peak CPU", value: formatMetricValue(summary.peakCpuPercent, "%") },
    { label: "Avg Memory", value: formatMetricValue(summary.avgMemoryMb, "MB") },
    { label: "Peak Memory", value: formatMetricValue(summary.peakMemoryMb, "MB") },
    { label: "Network RX", value: formatMetricValue(summary.networkRxMb, "MB") },
    { label: "Network TX", value: formatMetricValue(summary.networkTxMb, "MB") },
    { label: "Battery Drain", value: formatMetricValue(summary.batteryDrainPercent, "%") },
    { label: "Thermal Events", value: formatNumber(summary.thermalEvents, 0) }
  ];
}

export function buildReportViewModel(options: {
  summary: ReportSummary;
  markers?: EventMarker[];
  session?: Session | null;
  metrics?: MetricEvent[];
}): ReportViewModel {
  const metrics = options.metrics ?? [];
  const hasMockMetrics = metrics.some((metric) => metric.source === "mock");
  const hasDeviceLevelNetwork = metrics.some(
    (metric) => metric.metricName.startsWith("network_") && metric.precision === "device_level"
  );
  const hasAndroidMetrics = metrics.some((metric) => metric.tags?.platform === "android" || metric.source.startsWith("adb:"));
  const hasPcMetrics = metrics.some(
    (metric) => metric.tags?.platform === "windows" || metric.source.startsWith("windows:")
  );
  const hasPresentMonMetrics = metrics.some((metric) => metric.source.startsWith("PresentMon"));
  const timeline: ReportViewModel["timeline"] = {
    markerCount: options.markers?.length ?? 0,
    metricCount: metrics.length
  };
  if (options.session?.startedAt !== undefined) {
    timeline.startedAt = options.session.startedAt;
  }
  if (options.session?.endedAt !== undefined) {
    timeline.endedAt = options.session.endedAt;
  }
  const range = metricRange(metrics);
  if (range.metricStartMs !== undefined) {
    timeline.metricStartMs = range.metricStartMs;
  }
  if (range.metricEndMs !== undefined) {
    timeline.metricEndMs = range.metricEndMs;
  }

  return {
    summaryItems: buildSummaryItems(options.summary),
    markers: options.markers ?? [],
    sourceNotice: hasMockMetrics
      ? "Mock metrics are for development and testing only. They do not represent a real device."
      : hasDeviceLevelNetwork
        ? "Android network includes device-level counters. Device-level network may include traffic from other apps and is not target-only traffic."
        : hasPresentMonMetrics
          ? "PresentMon FPS/frame-time metrics come from explicit CSV capture and target process matching. Capture is experimental and raw CSV/local paths are not shown."
        : hasAndroidMetrics
          ? "Android metrics are collected through ADB. UID-level network stats are estimated and some fields are device-dependent."
          : hasPcMetrics
            ? "PC metrics are sampled from Windows process counters. PresentMon FPS/frame-time remains N/A unless explicit capture produced matched data."
            : "Metrics include source, precision, and confidence metadata for each sample.",
    timeline
  };
}
