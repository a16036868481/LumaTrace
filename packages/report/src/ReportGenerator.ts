import {
  METRIC_NAMES,
  summarizeBattery,
  summarizeCpu,
  summarizeFps,
  summarizeMemory,
  summarizeNetworkDeltas,
  type BatteryLevelSample,
  type MetricEvent,
  type ReportSummary,
  type Session
} from "@lumatrace/core";
import type { NetworkDelta } from "@lumatrace/core";
import { CsvExporter } from "./exporters/CsvExporter";
import { HtmlExporter } from "./exporters/HtmlExporter";
import { JsonExporter } from "./exporters/JsonExporter";
import type {
  GeneratedReport,
  PcReportDiagnosticsSection,
  ReportBuildResult,
  ReportDocument,
  ReportFilePaths,
  ReportGeneratorDependencies,
  ReportGeneratorOptions,
  ReportInput
} from "./types";
import { writeReportFiles } from "./utils/fileWriter";
import { buildAndroidReportDiagnosticsSection } from "./utils/androidDiagnostics";
import { cpuMetricValues, inferRefreshRate, metricValues } from "./utils/metricGrouping";
import {
  localizationFromSessionConfig,
  normalizeReportLocalization
} from "./localization/reportLocalization";

const DEFAULT_VERSION = "mvp-a";
const REJECTED_CPU_TEMPERATURE_SOURCES = new Set(["windows:acpi-processor-thermal-zone"]);

function calculateDurationMs(session: Session, metrics: readonly MetricEvent[]): number {
  if (
    session.startedAt !== undefined &&
    session.endedAt !== undefined &&
    session.endedAt >= session.startedAt
  ) {
    return session.endedAt - session.startedAt;
  }

  const timestamps = metrics
    .map((event) => event.timestampMs)
    .filter((timestamp) => Number.isFinite(timestamp));
  if (timestamps.length < 2) {
    return 0;
  }

  return Math.max(...timestamps) - Math.min(...timestamps);
}

function buildNetworkDeltas(metrics: readonly MetricEvent[]): NetworkDelta[] {
  const rxBytesEvents = metrics.filter(
    (event) => event.metricName === METRIC_NAMES.NETWORK_RX_BYTES && event.value !== null
  );
  const txBytesEvents = metrics.filter(
    (event) => event.metricName === METRIC_NAMES.NETWORK_TX_BYTES && event.value !== null
  );
  const deltas: NetworkDelta[] = [];

  for (const rxEvent of rxBytesEvents) {
    const txEvent = txBytesEvents.find((event) => event.timestampMs === rxEvent.timestampMs);
    const intervalMs =
      typeof rxEvent.tags?.intervalMs === "number" ? rxEvent.tags.intervalMs : 1000;
    if (txEvent === undefined || rxEvent.value === null || txEvent.value === null) {
      continue;
    }

    deltas.push({
      rxBytes: rxEvent.value,
      txBytes: txEvent.value,
      rxBytesPerSecond: intervalMs > 0 ? rxEvent.value / (intervalMs / 1000) : 0,
      txBytesPerSecond: intervalMs > 0 ? txEvent.value / (intervalMs / 1000) : 0,
      intervalMs
    });
  }

  if (deltas.length > 0) {
    return deltas;
  }

  const rxRateEvents = metrics.filter(
    (event) =>
      (event.metricName === METRIC_NAMES.NETWORK_RX_RATE_BPS ||
        event.metricName === METRIC_NAMES.NETWORK_RX_BYTES_PER_SEC) &&
      event.value !== null
  );
  const txRateEvents = metrics.filter(
    (event) =>
      (event.metricName === METRIC_NAMES.NETWORK_TX_RATE_BPS ||
        event.metricName === METRIC_NAMES.NETWORK_TX_BYTES_PER_SEC) &&
      event.value !== null
  );
  for (const rxEvent of rxRateEvents) {
    const txEvent = txRateEvents.find((event) => event.timestampMs === rxEvent.timestampMs);
    const intervalMs =
      typeof rxEvent.tags?.intervalMs === "number" ? rxEvent.tags.intervalMs : 1000;
    if (
      txEvent === undefined ||
      rxEvent.value === null ||
      txEvent.value === null ||
      intervalMs <= 0
    ) {
      continue;
    }

    deltas.push({
      rxBytes: rxEvent.value * (intervalMs / 1000),
      txBytes: txEvent.value * (intervalMs / 1000),
      rxBytesPerSecond: rxEvent.value,
      txBytesPerSecond: txEvent.value,
      intervalMs
    });
  }

  return deltas;
}

function buildBatterySamples(metrics: readonly MetricEvent[]): BatteryLevelSample[] {
  return metrics
    .filter(
      (event) => event.metricName === METRIC_NAMES.BATTERY_LEVEL_PERCENT && event.value !== null
    )
    .map((event) => ({ timestampMs: event.timestampMs, levelPercent: event.value }))
    .filter((sample): sample is BatteryLevelSample => Number.isFinite(sample.levelPercent));
}

function assignDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function assignAverageAndPeak(
  summary: ReportSummary,
  values: readonly number[],
  averageKey: keyof ReportSummary,
  peakKey: keyof ReportSummary
): void {
  if (values.length === 0) {
    return;
  }
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const peak = Math.max(...values);
  Object.assign(summary, { [averageKey]: average, [peakKey]: peak });
}

export function buildSummary(input: ReportInput): ReportSummary {
  const frameTimesMs = metricValues(input.metrics, METRIC_NAMES.FRAME_TIME_MS);
  const fpsSamples = metricValues(input.metrics, METRIC_NAMES.FPS);
  const cpuSamples = cpuMetricValues(input.metrics);
  const gpuSamples = metricValues(input.metrics, METRIC_NAMES.GPU_UTILIZATION);
  const memorySamples = metricValues(input.metrics, METRIC_NAMES.MEMORY_MB);
  const powerSamples = metricValues(input.metrics, METRIC_NAMES.POWER_W);
  const cpuTemperatureSamples = metricValues(
    input.metrics.filter((event) => !REJECTED_CPU_TEMPERATURE_SOURCES.has(event.source)),
    METRIC_NAMES.CPU_TEMPERATURE_C
  );
  const gpuTemperatureSamples = metricValues(input.metrics, METRIC_NAMES.GPU_TEMPERATURE_C);
  const legacyTemperatureSamples = metricValues(input.metrics, METRIC_NAMES.TEMPERATURE_C);
  const thermalEvents = input.metrics.filter(
    (event) => event.metricName === METRIC_NAMES.THERMAL_EVENT && event.value !== null
  );
  const summary: ReportSummary = {
    durationMs: calculateDurationMs(input.session, input.metrics)
  };

  if (frameTimesMs.length > 0 || fpsSamples.length > 0) {
    const refreshRate = inferRefreshRate(input.metrics);
    const fpsSummary = summarizeFps({
      frameTimesMs,
      fpsSamples,
      ...(refreshRate === undefined ? {} : { refreshRate })
    });

    assignDefined(summary, "avgFps", fpsSummary.avgFps);
    assignDefined(summary, "minFps", fpsSummary.minFps);
    assignDefined(summary, "maxFps", fpsSummary.maxFps);
    assignDefined(summary, "onePercentLowFps", fpsSummary.onePercentLowFps);
    assignDefined(summary, "zeroPointOnePercentLowFps", fpsSummary.zeroPointOnePercentLowFps);
    assignDefined(summary, "p50FrameTimeMs", fpsSummary.p50FrameTimeMs);
    assignDefined(summary, "p90FrameTimeMs", fpsSummary.p90FrameTimeMs);
    assignDefined(summary, "p95FrameTimeMs", fpsSummary.p95FrameTimeMs);
    assignDefined(summary, "p99FrameTimeMs", fpsSummary.p99FrameTimeMs);
    summary.jankCount = fpsSummary.jankCount;
    summary.severeJankCount = fpsSummary.severeJankCount;
  }

  Object.assign(summary, summarizeCpu(cpuSamples));
  assignAverageAndPeak(summary, gpuSamples, "avgGpuPercent", "peakGpuPercent");
  Object.assign(summary, summarizeMemory(memorySamples));
  assignAverageAndPeak(summary, powerSamples, "avgPowerW", "peakPowerW");
  assignAverageAndPeak(summary, cpuTemperatureSamples, "avgCpuTemperatureC", "peakCpuTemperatureC");
  assignAverageAndPeak(summary, gpuTemperatureSamples, "avgGpuTemperatureC", "peakGpuTemperatureC");
  assignAverageAndPeak(summary, legacyTemperatureSamples, "avgTemperatureC", "peakTemperatureC");
  Object.assign(summary, summarizeNetworkDeltas(buildNetworkDeltas(input.metrics)));
  Object.assign(summary, summarizeBattery(buildBatterySamples(input.metrics), thermalEvents));

  return summary;
}

function mergeLimitations(
  localization: ReportGeneratorOptions["localization"],
  limitations: readonly string[] = []
): string[] {
  const normalized = normalizeReportLocalization(localization);
  return [
    ...new Set([
      normalized.strings.localData,
      normalized.strings.coreMetricsHelp,
      normalized.strings.diagnosticPrivacy,
      ...limitations
    ])
  ];
}

function incrementCounter(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function sanitizeReportText(value: string): string {
  return value
    .replace(/[A-Za-z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]*)?/gu, "<user-path>")
    .replace(/\/(?:Users|home)\/[^/\s"'<>]+(?:\/[^\s"'<>]*)?/gu, "<user-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "<email>");
}

function sanitizeReportUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeReportText(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeReportUnknown(item));
  }
  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (/stack|rawCsv|raw CSV|commandLine/i.test(key)) {
        continue;
      }
      sanitized[key] = sanitizeReportUnknown(entry);
    }
    return sanitized;
  }
  return String(value);
}

function buildPcReportDiagnosticsSection(
  input: ReportInput
): PcReportDiagnosticsSection | undefined {
  const pcDiagnostics = (input.diagnostics ?? [])
    .filter((record) => record.category.startsWith("pc"))
    .map((record) => ({
      ...record,
      message: sanitizeReportText(record.message),
      ...(record.details === undefined
        ? {}
        : { details: sanitizeReportUnknown(record.details) as Record<string, unknown> })
    }));
  const hasPcMetrics = input.metrics.some(
    (event) => event.tags?.platform === "windows" || event.source.startsWith("windows:")
  );
  const hasPresentMonMetrics = input.metrics.some((event) => event.source.startsWith("PresentMon"));
  const hasProcessGpuMetrics = input.metrics.some(
    (event) => event.metricName === METRIC_NAMES.GPU_UTILIZATION && event.tags?.scope === "process"
  );
  const hasDeviceSensorMetrics = input.metrics.some(
    (event) =>
      (event.metricName === METRIC_NAMES.POWER_W ||
        event.metricName === METRIC_NAMES.CPU_TEMPERATURE_C ||
        event.metricName === METRIC_NAMES.GPU_TEMPERATURE_C ||
        event.metricName === METRIC_NAMES.TEMPERATURE_C ||
        event.metricName === METRIC_NAMES.GPU_UTILIZATION) &&
      event.precision === "device_level"
  );
  const presentMonAvailability = (input.availability ?? input.device.capabilities).find(
    (availability) =>
      availability.platform === "windows" &&
      (availability.metricName === METRIC_NAMES.FPS ||
        availability.metricName === METRIC_NAMES.FRAME_TIME_MS)
  );
  const notices: string[] = [];

  if (hasPcMetrics) {
    notices.push("PC CPU and memory metrics are sampled from Windows process counters.");
  }
  if (hasProcessGpuMetrics) {
    notices.push(
      "PC GPU utilization is sampled for the selected process from Windows GPU Engine counters using its busiest engine."
    );
  }
  if (hasDeviceSensorMetrics) {
    notices.push(
      "GPU power plus CPU/GPU temperature sensor values are device-level hardware readings; they are not attributed to the selected process."
    );
  }
  if (presentMonAvailability?.status === "requires_tool") {
    notices.push(
      "PresentMon is required for PC FPS/frame-time capture; missing PresentMon does not block CPU/memory."
    );
  }
  if (presentMonAvailability?.status === "experimental") {
    notices.push(
      "PC FPS/frame-time collection is experimental and must be explicitly enabled for a PC process session."
    );
  }
  if (hasPresentMonMetrics) {
    notices.push(
      "PresentMon FPS/frame-time metrics come from explicit CSV capture and target process matching. Raw CSV content and full local paths are not included."
    );
  }
  const presentMonDiagnostics = pcDiagnostics.filter(
    (record) =>
      typeof record.details?.pcCode === "string" &&
      String(record.details.pcCode).startsWith("PRESENTMON_")
  );
  const lastPresentMonDiagnostic = presentMonDiagnostics[0];
  const compatibilityDiagnostic = presentMonDiagnostics.find(
    (record) => record.details?.pcCode === "PRESENTMON_VERSION_DETECTED"
  );
  const permissionNotices = presentMonDiagnostics
    .filter(
      (record) =>
        record.details?.pcCode === "PRESENTMON_PERMISSION_LIMITED" ||
        record.details?.pcCode === "PRESENTMON_LOG_ACCESS_USERS_HINT" ||
        record.details?.pcCode === "PRESENTMON_ADMIN_HINT"
    )
    .map((record) => record.message);
  const noDataReasons = presentMonDiagnostics
    .filter(
      (record) =>
        record.details?.pcCode === "PRESENTMON_TARGET_NO_MATCH" ||
        record.details?.pcCode === "PRESENTMON_TARGET_AMBIGUOUS" ||
        record.details?.pcCode === "PRESENTMON_CSV_EMPTY" ||
        record.details?.pcCode === "PRESENTMON_CSV_MISSING" ||
        record.details?.pcCode === "PRESENTMON_PROCESS_EXITED_DURING_CAPTURE" ||
        record.details?.pcCode === "PRESENTMON_PID_REUSED_DURING_CAPTURE"
    )
    .map((record) => record.message);
  const csvRetentionDiagnostic = presentMonDiagnostics.find(
    (record) =>
      record.details?.pcCode === "PRESENTMON_CSV_RETAINED" ||
      record.details?.pcCode === "PRESENTMON_CSV_DELETED"
  );

  if (pcDiagnostics.length === 0 && notices.length === 0) {
    return undefined;
  }

  const byLevel: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const diagnostic of pcDiagnostics) {
    incrementCounter(byLevel, diagnostic.level);
    incrementCounter(byCategory, diagnostic.category);
  }

  return {
    pcDiagnosticsSummary: {
      total: pcDiagnostics.length,
      byLevel,
      byCategory,
      warnings: byLevel.warn ?? 0,
      errors: byLevel.error ?? 0
    },
    diagnosticsTimeline: pcDiagnostics,
    sourcePrecisionNotices: notices,
    ...(lastPresentMonDiagnostic === undefined
      ? {}
      : { presentMonCaptureStatus: lastPresentMonDiagnostic.message }),
    ...(compatibilityDiagnostic?.details?.details !== undefined &&
    typeof compatibilityDiagnostic.details.details === "object" &&
    compatibilityDiagnostic.details.details !== null
      ? {
          presentMonCompatibility: compatibilityDiagnostic.details.details as Record<
            string,
            unknown
          >
        }
      : {}),
    ...(csvRetentionDiagnostic === undefined
      ? {}
      : { csvRetentionSummary: csvRetentionDiagnostic.message }),
    permissionNotices,
    noDataReasons
  };
}

function requireDependency<T>(dependency: T | undefined, name: string): T {
  if (dependency === undefined) {
    throw new Error(`${name} is required for generateFromStorage().`);
  }

  return dependency;
}

export class ReportGenerator {
  private readonly dependencies: ReportGeneratorDependencies;
  private readonly jsonExporter = new JsonExporter();
  private readonly csvExporter = new CsvExporter();
  private readonly htmlExporter = new HtmlExporter();

  constructor(dependencies: ReportGeneratorDependencies = {}) {
    this.dependencies = dependencies;
  }

  generate(input: ReportInput, options: ReportGeneratorOptions = {}): GeneratedReport {
    return this.build(input, options).report;
  }

  generateFromStorage(sessionId: string, options: ReportGeneratorOptions = {}): GeneratedReport {
    const sessionRepository = requireDependency(
      this.dependencies.sessionRepository,
      "sessionRepository"
    );
    const deviceRepository = requireDependency(
      this.dependencies.deviceRepository,
      "deviceRepository"
    );
    const targetRepository = requireDependency(
      this.dependencies.targetRepository,
      "targetRepository"
    );
    const metricRepository = requireDependency(
      this.dependencies.metricRepository,
      "metricRepository"
    );
    const markerRepository = requireDependency(
      this.dependencies.markerRepository,
      "markerRepository"
    );

    const session = sessionRepository.getById(sessionId);
    if (session === null) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const device = deviceRepository.getById(session.deviceId);
    if (device === null) {
      throw new Error(`Device not found: ${session.deviceId}`);
    }

    const target = targetRepository.getById(session.targetId);
    if (target === null) {
      throw new Error(`Target not found: ${session.targetId}`);
    }

    const diagnostics = this.dependencies.diagnosticRepository?.list({ sessionId, limit: 1000 });
    const input: ReportInput = {
      session,
      device,
      target,
      metrics: metricRepository.queryRaw({ sessionId }),
      markers: markerRepository.listBySession(sessionId),
      availability: device.capabilities,
      ...(diagnostics === undefined ? {} : { diagnostics })
    };
    const result = this.build(input, options);

    if (options.saveToRepository === true) {
      const reportRepository = requireDependency(
        this.dependencies.reportRepository,
        "reportRepository"
      );
      reportRepository.save(sessionId, result.report.summary, undefined, result.report.version);
    }

    return result.report;
  }

  async writeFiles(
    report: GeneratedReport,
    options: ReportGeneratorOptions
  ): Promise<ReportFilePaths> {
    const paths = await writeReportFiles(report, options);

    if (options.saveToRepository === true) {
      const reportRepository = requireDependency(
        this.dependencies.reportRepository,
        "reportRepository"
      );
      reportRepository.save(report.sessionId, report.summary, paths, report.version);
    }

    return paths;
  }

  build(input: ReportInput, options: ReportGeneratorOptions = {}): ReportBuildResult {
    const version = options.version ?? DEFAULT_VERSION;
    const localization =
      options.localization === undefined
        ? localizationFromSessionConfig(input.session.config)
        : normalizeReportLocalization(options.localization);
    const generatedAt = input.generatedAt ?? Date.now();
    const summary = buildSummary(input);
    const androidDiagnostics = buildAndroidReportDiagnosticsSection({
      device: input.device,
      metrics: input.metrics,
      diagnostics: input.diagnostics ?? []
    });
    const pcDiagnostics = buildPcReportDiagnosticsSection(input);
    const document: ReportDocument = {
      version,
      locale: localization.locale,
      generatedAt,
      session: input.session,
      device: input.device,
      target: input.target,
      summary,
      markers: input.markers,
      availability: input.availability ?? input.device.capabilities,
      toolStatus: input.toolStatus ?? [],
      rawMetricCount: input.metrics.length,
      limitations: mergeLimitations(localization, input.limitations),
      metrics: input.metrics,
      ...(androidDiagnostics === undefined ? {} : { androidDiagnostics }),
      ...(pcDiagnostics === undefined ? {} : { pcDiagnostics })
    };
    const json = this.jsonExporter.export(document, {
      includeRawMetricsInJson: options.includeRawMetricsInJson ?? true
    });
    const csv = this.csvExporter.export(input.metrics);
    const html = this.htmlExporter.export(document, {
      includeRawMetricsInHtml: options.includeRawMetricsInHtml ?? false,
      maxHtmlMetricRows: options.maxHtmlMetricRows ?? 500,
      localization
    });

    return {
      document,
      report: {
        sessionId: input.session.id,
        generatedAt,
        summary,
        json,
        csv,
        html,
        rawMetricCount: input.metrics.length,
        version
      }
    };
  }
}
