import type { Device, MetricEvent } from "@lumatrace/core";
import type { DiagnosticRecord } from "@lumatrace/storage";
import type { AndroidReportDiagnosticsSection } from "../types";

function countBy(records: readonly DiagnosticRecord[], key: "level" | "category"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record[key]] = (counts[record[key]] ?? 0) + 1;
  }
  return counts;
}

function diagnosticCode(record: DiagnosticRecord): string | undefined {
  const details = record.details;
  if (details !== undefined && typeof details.code === "string") {
    return details.code;
  }
  if (details !== undefined && typeof details.androidCode === "string") {
    return details.androidCode;
  }
  return undefined;
}

function countByCode(records: readonly DiagnosticRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const code = diagnosticCode(record);
    if (code !== undefined) {
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  return counts;
}

function hasDeviceLevelNetwork(metrics: readonly MetricEvent[]): boolean {
  return metrics.some((event) => event.metricName.startsWith("network_") && event.precision === "device_level");
}

function hasMeminfoFallback(metrics: readonly MetricEvent[]): boolean {
  return metrics.some((event) => event.metricName === "memory_mb" && event.tags?.fallback === true);
}

function hasExperimentalFps(device: Device, metrics: readonly MetricEvent[], diagnostics: readonly DiagnosticRecord[]): boolean {
  return (
    device.platform === "android" &&
    (metrics.some((event) => event.tags?.experimental === true && event.metricName.includes("fps")) ||
      diagnostics.some((record) => record.category === "fps" || /fps/i.test(record.message)))
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function important(record: DiagnosticRecord): boolean {
  const code = diagnosticCode(record);
  return (
    record.level === "error" ||
    record.level === "warn" ||
    code === "PID_MISSING" ||
    code === "PID_REBOUND" ||
    code === "NETWORK_FALLBACK_DEVICE_LEVEL" ||
    code === "MEMINFO_FALLBACK_PROC_STATUS" ||
    code === "FPS_LAYER_MATCH_NONE" ||
    code === "FPS_LAYER_MATCH_AMBIGUOUS" ||
    code === "FPS_PROBE_FAILED"
  );
}

export function buildAndroidReportDiagnosticsSection(input: {
  device: Device;
  metrics: readonly MetricEvent[];
  diagnostics: readonly DiagnosticRecord[];
}): AndroidReportDiagnosticsSection | undefined {
  const androidDiagnostics = input.diagnostics.filter((record) => !record.category.startsWith("pc:"));
  if (input.device.platform !== "android" && androidDiagnostics.length === 0) {
    return undefined;
  }

  const diagnosticsTimeline = [...androidDiagnostics].sort(
    (left, right) => left.timestampMs - right.timestampMs || left.id.localeCompare(right.id)
  );
  const deviceLevelNetwork = hasDeviceLevelNetwork(input.metrics);
  const meminfoFallback = hasMeminfoFallback(input.metrics);
  const experimentalFps = hasExperimentalFps(input.device, input.metrics, diagnosticsTimeline);

  const sourcePrecisionNotices = unique([
    deviceLevelNetwork ? "Device-level network counters may include traffic from other apps." : "",
    experimentalFps ? "Android FPS probe is experimental." : ""
  ]);
  const fallbackNotices = unique([
    meminfoFallback ? "Memory fell back to /proc/<pid>/status with lower confidence." : "",
    deviceLevelNetwork ? "Network fell back to device-level /proc/net/dev counters." : ""
  ]);
  const section: AndroidReportDiagnosticsSection = {
    androidDiagnosticsSummary: {
      total: diagnosticsTimeline.length,
      byLevel: countBy(diagnosticsTimeline, "level"),
      byCategory: countBy(diagnosticsTimeline, "category"),
      byCode: countByCode(diagnosticsTimeline),
      warnings: diagnosticsTimeline.filter((record) => record.level === "warn").length,
      errors: diagnosticsTimeline.filter((record) => record.level === "error").length,
      importantEvents: diagnosticsTimeline.filter(important)
    },
    diagnosticsTimeline,
    sourcePrecisionNotices,
    fallbackNotices,
    lifecycleEvents: diagnosticsTimeline.filter((record) => record.category === "lifecycle"),
    processEvents: diagnosticsTimeline.filter((record) => record.category === "process")
  };

  const fpsProbeResult = [...diagnosticsTimeline]
    .reverse()
    .find((record) => record.category === "fps" || /fps/i.test(record.message));
  if (fpsProbeResult !== undefined) {
    section.fpsProbeResult = fpsProbeResult;
  }
  if (deviceLevelNetwork) {
    section.networkPrecisionNotice = "Device-level network data is not target-only traffic.";
  }
  return section;
}
