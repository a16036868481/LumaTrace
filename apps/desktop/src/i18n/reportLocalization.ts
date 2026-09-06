import type { ReportSummary } from "@lumatrace/core";
import { rtlLocales, type Locale, type TranslationKey } from "./translations";

export interface ReportLocalizationPayload {
  locale: string;
  direction: "ltr" | "rtl";
  strings: Record<string, string>;
  summaryLabels: Partial<Record<keyof ReportSummary, string>>;
}

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function buildReportLocalization(locale: Locale, t: Translate): ReportLocalizationPayload {
  const fps = t("metric.fps");
  const frameTime = t("metric.frameTime");
  const cpu = t("metric.cpu");
  const gpu = t("metric.gpu");
  const memory = t("metric.memory");
  const power = t("metric.power");
  const cpuTemperature = t("metric.cpuTemperature");
  const gpuTemperature = t("metric.gpuTemperature");
  const temperature = t("metric.temperature");
  const networkRx = t("report.networkRx");
  const networkTx = t("report.networkTx");

  return {
    locale,
    direction: rtlLocales.has(locale) ? "rtl" : "ltr",
    strings: {
      title: t("report.title"),
      session: t("session.title"),
      device: t("common.device"),
      target: t("common.target"),
      generated: t("common.time"),
      rawMetrics: t("report.rawMetrics"),
      version: t("common.version"),
      summary: t("report.coreMetrics"),
      fpsAnalysis: `${fps} · ${t("report.coreMetrics")}`,
      startedAt: t("report.startedAt"),
      endedAt: t("report.endedAt"),
      coreMetricsHelp: t("report.coreMetricsHelp"),
      markers: t("report.markers"),
      metricAvailability: t("device.metricAvailability"),
      toolStatus: t("tools.toolStatus"),
      dataQuality: t("metricQuality.title"),
      localData: t("status.localData"),
      metricSamples: t("common.metrics"),
      timestamp: t("common.time"),
      label: t("marker.label"),
      description: t("marker.description"),
      details: t("common.details"),
      metric: t("common.metric"),
      value: t("common.value"),
      source: t("common.source"),
      precision: t("common.precision"),
      confidence: t("common.confidence"),
      platform: t("common.platform"),
      status: t("common.status"),
      reason: t("tools.reason"),
      action: t("common.action"),
      tool: t("tools.tool"),
      diagnostics: t("tools.diagnostics"),
      androidDiagnostics: `Android · ${t("tools.diagnostics")}`,
      pcDiagnostics: `Windows · ${t("tools.diagnostics")}`,
      diagnosticPrivacy: t("report.diagnosticsNotice"),
      presentMonStatus: t("presentMon.captureStatus"),
      csvRetention: t("presentMon.retentionTitle"),
      permissions: t("presentMon.permissionsTitle"),
      noData: t("report.noTrendData"),
      notAvailable: t("common.na"),
      warnings: t("common.warn"),
      errors: t("common.error"),
      frameMetricRows: `${frameTime} · ${t("report.rawMetrics")}`,
      showingMetricRows: t("report.rawMetrics"),
      performanceConclusion: t("report.performanceConclusion"),
      performancePoor: t("report.performancePoor"),
      performanceFair: t("report.performanceFair"),
      performanceGood: t("report.performanceGood"),
      performanceUnavailable: t("report.performanceUnavailable"),
      stabilityGood: t("report.stabilityGood"),
      stabilityNeedsAttention: t("report.stabilityNeedsAttention"),
      stabilityUnavailable: t("report.stabilityUnavailable"),
      performanceThresholdNote: t("report.performanceThresholdNote")
    },
    summaryLabels: {
      durationMs: t("report.testDuration"),
      avgFps: t("report.avgFps"),
      minFps: `↓ ${fps}`,
      maxFps: `↑ ${fps}`,
      onePercentLowFps: t("report.onePercentLow"),
      zeroPointOnePercentLowFps: `0.1% Low ${fps}`,
      p50FrameTimeMs: `P50 ${frameTime}`,
      p90FrameTimeMs: `P90 ${frameTime}`,
      p95FrameTimeMs: t("report.p95FrameTime"),
      p99FrameTimeMs: `P99 ${frameTime}`,
      jankCount: `⚠ ${frameTime}`,
      severeJankCount: `⚠⚠ ${frameTime}`,
      avgCpuPercent: t("report.avgCpu"),
      peakCpuPercent: `↑ ${cpu}`,
      avgGpuPercent: `Ø ${gpu}`,
      peakGpuPercent: `↑ ${gpu}`,
      avgMemoryMb: t("report.avgMemory"),
      peakMemoryMb: `↑ ${memory}`,
      avgPowerW: `Ø ${power}`,
      peakPowerW: `↑ ${power}`,
      avgCpuTemperatureC: `Ø ${cpuTemperature}`,
      peakCpuTemperatureC: `↑ ${cpuTemperature}`,
      avgGpuTemperatureC: `Ø ${gpuTemperature}`,
      peakGpuTemperatureC: `↑ ${gpuTemperature}`,
      avgTemperatureC: `Ø ${temperature}`,
      peakTemperatureC: `↑ ${temperature}`,
      networkRxMb: networkRx,
      networkTxMb: networkTx,
      batteryDrainPercent: t("report.batteryDrain"),
      thermalEvents: temperature
    }
  };
}
