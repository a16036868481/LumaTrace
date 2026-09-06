import type { ReportSummary } from "@lumatrace/core";
import type { ReportLocalization, ReportLocalizationStrings } from "../types";

const DEFAULT_SUMMARY_LABELS: Record<keyof ReportSummary, string> = {
  durationMs: "Duration",
  avgFps: "Average FPS",
  minFps: "Minimum FPS",
  maxFps: "Maximum FPS",
  onePercentLowFps: "1% Low FPS",
  zeroPointOnePercentLowFps: "0.1% Low FPS",
  p50FrameTimeMs: "P50 Frame Time",
  p90FrameTimeMs: "P90 Frame Time",
  p95FrameTimeMs: "P95 Frame Time",
  p99FrameTimeMs: "P99 Frame Time",
  jankCount: "Jank",
  severeJankCount: "Severe Jank",
  avgCpuPercent: "Average CPU",
  peakCpuPercent: "Peak CPU",
  avgGpuPercent: "Average GPU",
  peakGpuPercent: "Peak GPU",
  avgMemoryMb: "Average Memory",
  peakMemoryMb: "Peak Memory",
  avgPowerW: "Average GPU Power",
  peakPowerW: "Peak GPU Power",
  avgCpuTemperatureC: "Average CPU Temperature",
  peakCpuTemperatureC: "Peak CPU Temperature",
  avgGpuTemperatureC: "Average GPU Temperature",
  peakGpuTemperatureC: "Peak GPU Temperature",
  avgTemperatureC: "Average Temperature",
  peakTemperatureC: "Peak Temperature",
  networkRxMb: "Network Download",
  networkTxMb: "Network Upload",
  batteryDrainPercent: "Battery Drain",
  thermalEvents: "Thermal Events"
};

const DEFAULT_STRINGS: ReportLocalizationStrings = {
  title: "Test Results",
  session: "Test Session",
  device: "Device",
  target: "Target",
  generated: "Generated",
  rawMetrics: "Raw metrics",
  version: "Version",
  summary: "Core Metrics",
  fpsAnalysis: "FPS Analysis",
  startedAt: "Started",
  endedAt: "Ended",
  coreMetricsHelp: "Missing values stay N/A and are never filled with 0.",
  markers: "Markers",
  metricAvailability: "Metric Availability",
  toolStatus: "Tool Status",
  dataQuality: "Data quality",
  localData: "Data is stored locally.",
  metricSamples: "Metric Samples",
  timestamp: "Timestamp",
  label: "Label",
  description: "Description",
  details: "Details",
  metric: "Metric",
  value: "Value",
  source: "Source",
  precision: "Precision",
  confidence: "Confidence",
  platform: "Platform",
  status: "Status",
  reason: "Reason",
  action: "Action",
  tool: "Tool",
  diagnostics: "Diagnostics",
  androidDiagnostics: "Android Diagnostics",
  pcDiagnostics: "PC Diagnostics",
  diagnosticPrivacy: "Diagnostic exports are sanitized and exclude private raw logs.",
  presentMonStatus: "PresentMon status",
  csvRetention: "PresentMon CSV Retention",
  permissions: "PresentMon Permissions",
  noData: "No chart data",
  notAvailable: "N/A",
  warnings: "Warnings",
  errors: "Errors",
  frameMetricRows: "Frame metric rows used",
  showingMetricRows: "Showing metric rows",
  performanceConclusion: "Performance Conclusion",
  performancePoor:
    "Average FPS is {avg}, below 30 FPS. Performance is poor and visible stutter is likely.",
  performanceFair:
    "Average FPS is {avg}, between 30 and 59.9 FPS. Performance is acceptable, but demanding scenes may feel less smooth.",
  performanceGood:
    "Average FPS is {avg}, at or above 60 FPS. Performance is good and the experience should generally feel smooth.",
  performanceUnavailable:
    "Average FPS was not collected, so this report cannot rate rendering performance.",
  stabilityGood:
    "1% Low is {onePercentLow} FPS ({ratio}% of the average), indicating generally stable frame delivery.",
  stabilityNeedsAttention:
    "1% Low is {onePercentLow} FPS ({ratio}% of the average), indicating noticeable frame-rate fluctuations.",
  stabilityUnavailable: "There is not enough 1% Low data to assess frame-rate stability.",
  performanceThresholdNote:
    "These FPS bands are general guidance. The target frame-rate cap, display refresh rate, visual settings, and test scenario can change the interpretation."
};

export const DEFAULT_REPORT_LOCALIZATION: ReportLocalization = {
  locale: "en-US",
  direction: "ltr",
  strings: DEFAULT_STRINGS,
  summaryLabels: DEFAULT_SUMMARY_LABELS
};

const STRING_KEYS = Object.keys(DEFAULT_STRINGS) as Array<keyof ReportLocalizationStrings>;
const SUMMARY_KEYS = Object.keys(DEFAULT_SUMMARY_LABELS) as Array<keyof ReportSummary>;

function boundedString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length === 0 || normalized.length > 240 ? fallback : normalized;
}

export function normalizeReportLocalization(value: unknown): ReportLocalization {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_REPORT_LOCALIZATION;
  }

  const candidate = value as {
    locale?: unknown;
    direction?: unknown;
    strings?: unknown;
    summaryLabels?: unknown;
  };
  const inputStrings =
    typeof candidate.strings === "object" && candidate.strings !== null
      ? (candidate.strings as Record<string, unknown>)
      : {};
  const strings = { ...DEFAULT_STRINGS };
  for (const key of STRING_KEYS) {
    strings[key] = boundedString(inputStrings[key], DEFAULT_STRINGS[key]);
  }

  const inputSummary =
    typeof candidate.summaryLabels === "object" && candidate.summaryLabels !== null
      ? (candidate.summaryLabels as Record<string, unknown>)
      : {};
  const summaryLabels = { ...DEFAULT_SUMMARY_LABELS };
  for (const key of SUMMARY_KEYS) {
    summaryLabels[key] = boundedString(inputSummary[key], DEFAULT_SUMMARY_LABELS[key]);
  }

  const locale =
    typeof candidate.locale === "string" &&
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(candidate.locale)
      ? candidate.locale
      : DEFAULT_REPORT_LOCALIZATION.locale;

  return {
    locale,
    direction: candidate.direction === "rtl" ? "rtl" : "ltr",
    strings,
    summaryLabels
  };
}

export function localizationFromSessionConfig(
  config: Record<string, unknown> | undefined
): ReportLocalization {
  return normalizeReportLocalization(config?.reportLocalization);
}
