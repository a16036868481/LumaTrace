import type { MetricAvailability, ReportSummary } from "@lumatrace/core";
import type { ReportDocument, ReportLocalization } from "../types";
import { formatValue, htmlEscape } from "../utils/htmlEscape";
import { normalizeReportLocalization } from "../localization/reportLocalization";

const SUMMARY_FIELDS: readonly [keyof ReportSummary, string][] = [
  ["durationMs", "ms"],
  ["avgFps", "fps"],
  ["minFps", "fps"],
  ["maxFps", "fps"],
  ["onePercentLowFps", "fps"],
  ["zeroPointOnePercentLowFps", "fps"],
  ["p50FrameTimeMs", "ms"],
  ["p90FrameTimeMs", "ms"],
  ["p95FrameTimeMs", "ms"],
  ["p99FrameTimeMs", "ms"],
  ["jankCount", "count"],
  ["severeJankCount", "count"],
  ["avgCpuPercent", "%"],
  ["peakCpuPercent", "%"],
  ["avgGpuPercent", "%"],
  ["peakGpuPercent", "%"],
  ["avgMemoryMb", "MB"],
  ["peakMemoryMb", "MB"],
  ["avgPowerW", "W"],
  ["peakPowerW", "W"],
  ["avgGpuTemperatureC", "C"],
  ["peakGpuTemperatureC", "C"],
  ["networkRxMb", "MB"],
  ["networkTxMb", "MB"],
  ["batteryDrainPercent", "%"],
  ["thermalEvents", "count"]
];

function numberDisplay(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return htmlEscape(Number(value.toFixed(2)));
  }

  return formatValue(value);
}

function renderSummary(summary: ReportSummary, localization: ReportLocalization): string {
  const cards = SUMMARY_FIELDS.map(([field, unit]) => {
    const value = summary[field];
    const label = localization.summaryLabels[field] ?? field;
    const unitLabel = value === undefined ? "" : ` <span>${htmlEscape(unit)}</span>`;
    return `<section class="metric-card"><div>${htmlEscape(label)}</div><strong>${numberDisplay(
      value
    )}</strong>${unitLabel}</section>`;
  }).join("");

  return `<div class="metric-grid">${cards}</div>`;
}

function renderFpsExplanation(document: ReportDocument, localization: ReportLocalization): string {
  const strings = localization.strings;
  const summary = document.summary;
  const fpsMetricCount = (document.metrics ?? []).filter(
    (event) => event.metricName === "fps" || event.metricName === "frame_time_ms"
  ).length;
  const startedAt =
    document.session.startedAt === undefined
      ? "N/A"
      : new Date(document.session.startedAt).toISOString();
  const endedAt =
    document.session.endedAt === undefined
      ? "N/A"
      : new Date(document.session.endedAt).toISOString();
  const hasFps = summary.avgFps !== undefined || summary.onePercentLowFps !== undefined;
  const focusValue = hasFps
    ? `${numberDisplay(summary.onePercentLowFps)} fps`
    : strings.notAvailable;

  return `<section>
    <h2>${htmlEscape(strings.fpsAnalysis)}</h2>
    <div class="panel">
      <p><strong>${htmlEscape(strings.startedAt)}:</strong> ${htmlEscape(startedAt)}</p>
      <p><strong>${htmlEscape(strings.endedAt)}:</strong> ${htmlEscape(endedAt)}</p>
      <p><strong>${htmlEscape(localization.summaryLabels.onePercentLowFps ?? "1% Low FPS")}:</strong> ${focusValue}</p>
      <p><strong>${htmlEscape(localization.summaryLabels.p95FrameTimeMs ?? "P95 Frame Time")}:</strong> ${numberDisplay(summary.p95FrameTimeMs)} ms · P99 ${numberDisplay(
        summary.p99FrameTimeMs
      )} ms · ${htmlEscape(localization.summaryLabels.jankCount ?? "Jank")} ${numberDisplay(summary.jankCount)}</p>
      <p class="note">${htmlEscape(strings.coreMetricsHelp)}</p>
      <p class="note">${htmlEscape(strings.frameMetricRows)}: ${htmlEscape(fpsMetricCount)}</p>
    </div>
  </section>`;
}

function renderMarkers(document: ReportDocument, localization: ReportLocalization): string {
  const strings = localization.strings;
  const rows = document.markers
    .map(
      (marker) => `<tr>
        <td>${htmlEscape(marker.timestampMs)}</td>
        <td>${htmlEscape(marker.label)}</td>
        <td>${htmlEscape(marker.description)}</td>
        <td>${htmlEscape(marker.tags)}</td>
      </tr>`
    )
    .join("");

  return `<table>
    <thead><tr><th>${htmlEscape(strings.timestamp)}</th><th>${htmlEscape(strings.label)}</th><th>${htmlEscape(strings.description)}</th><th>${htmlEscape(strings.details)}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4">N/A</td></tr>`}</tbody>
  </table>`;
}

function renderAvailability(
  availability: readonly MetricAvailability[],
  localization: ReportLocalization
): string {
  const strings = localization.strings;
  const rows = availability
    .map(
      (item) => `<tr>
        <td>${htmlEscape(item.metricName)}</td>
        <td>${htmlEscape(item.platform)}</td>
        <td>${htmlEscape(item.status)}</td>
        <td>${htmlEscape(item.source)}</td>
        <td>${htmlEscape(item.reason)}</td>
        <td>${htmlEscape(item.suggestedAction)}</td>
      </tr>`
    )
    .join("");

  return `<table>
    <thead><tr><th>${htmlEscape(strings.metric)}</th><th>${htmlEscape(strings.platform)}</th><th>${htmlEscape(strings.status)}</th><th>${htmlEscape(strings.source)}</th><th>${htmlEscape(strings.reason)}</th><th>${htmlEscape(strings.action)}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">N/A</td></tr>`}</tbody>
  </table>`;
}

function renderPcDiagnostics(document: ReportDocument, localization: ReportLocalization): string {
  const diagnostics = document.pcDiagnostics;
  if (diagnostics === undefined) {
    return "";
  }
  const strings = localization.strings;

  const noticeList =
    diagnostics.sourcePrecisionNotices.length === 0
      ? `<li>${htmlEscape(strings.notAvailable)}</li>`
      : diagnostics.sourcePrecisionNotices
          .map((notice) => `<li>${htmlEscape(notice)}</li>`)
          .join("");
  const permissionList =
    diagnostics.permissionNotices.length === 0
      ? `<li>${htmlEscape(strings.notAvailable)}</li>`
      : diagnostics.permissionNotices.map((notice) => `<li>${htmlEscape(notice)}</li>`).join("");
  const noDataList =
    diagnostics.noDataReasons.length === 0
      ? `<li>${htmlEscape(strings.notAvailable)}</li>`
      : diagnostics.noDataReasons.map((notice) => `<li>${htmlEscape(notice)}</li>`).join("");
  const rows = diagnostics.diagnosticsTimeline
    .map(
      (record) => `<tr>
        <td>${htmlEscape(record.timestampMs)}</td>
        <td>${htmlEscape(record.level)}</td>
        <td>${htmlEscape(record.category)}</td>
        <td>${htmlEscape(record.message)}</td>
        <td>${htmlEscape(record.details)}</td>
      </tr>`
    )
    .join("");

  return `<section>
    <h2>${htmlEscape(strings.pcDiagnostics)}</h2>
    <div class="panel">
      <p class="note">${htmlEscape(strings.diagnosticPrivacy)}</p>
      <ul>${noticeList}</ul>
      <p><strong>${htmlEscape(strings.presentMonStatus)}:</strong> ${htmlEscape(diagnostics.presentMonCaptureStatus ?? strings.notAvailable)}</p>
      <p><strong>${htmlEscape(strings.csvRetention)}:</strong> ${htmlEscape(diagnostics.csvRetentionSummary ?? strings.notAvailable)}</p>
      <p><strong>${htmlEscape(strings.permissions)}</strong></p>
      <ul>${permissionList}</ul>
      <p><strong>${htmlEscape(strings.noData)}</strong></p>
      <ul>${noDataList}</ul>
      <p>${htmlEscape(strings.warnings)}: ${htmlEscape(diagnostics.pcDiagnosticsSummary.warnings)} | ${htmlEscape(strings.errors)}: ${htmlEscape(
        diagnostics.pcDiagnosticsSummary.errors
      )}</p>
    </div>
    <table>
      <thead><tr><th>${htmlEscape(strings.timestamp)}</th><th>${htmlEscape(strings.status)}</th><th>${htmlEscape(strings.source)}</th><th>${htmlEscape(strings.description)}</th><th>${htmlEscape(strings.details)}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">N/A</td></tr>`}</tbody>
    </table>
  </section>`;
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => values[key] ?? match);
}

function renderPerformanceConclusion(
  summary: ReportSummary,
  localization: ReportLocalization
): string {
  const strings = localization.strings;
  const avgFps = summary.avgFps;
  let performanceText: string;

  if (avgFps === undefined || !Number.isFinite(avgFps)) {
    performanceText = strings.performanceUnavailable;
  } else {
    const template =
      avgFps < 30
        ? strings.performancePoor
        : avgFps < 60
          ? strings.performanceFair
          : strings.performanceGood;
    performanceText = interpolate(template, { avg: numberDisplay(avgFps) });
  }

  const onePercentLow = summary.onePercentLowFps;
  let stabilityText: string;
  if (
    avgFps === undefined ||
    !Number.isFinite(avgFps) ||
    avgFps <= 0 ||
    onePercentLow === undefined ||
    !Number.isFinite(onePercentLow)
  ) {
    stabilityText = strings.stabilityUnavailable;
  } else {
    const ratio = Math.max(0, (onePercentLow / avgFps) * 100);
    const template = ratio >= 70 ? strings.stabilityGood : strings.stabilityNeedsAttention;
    stabilityText = interpolate(template, {
      onePercentLow: numberDisplay(onePercentLow),
      ratio: numberDisplay(ratio)
    });
  }

  return `<section class="conclusion">
    <h2>${htmlEscape(strings.performanceConclusion)}</h2>
    <div class="panel conclusion-panel">
      <p class="conclusion-primary">${htmlEscape(performanceText)}</p>
      <p>${htmlEscape(stabilityText)}</p>
      <p class="note">${htmlEscape(strings.performanceThresholdNote)}</p>
    </div>
  </section>`;
}

export function renderReportHtml(
  document: ReportDocument,
  _maxHtmlMetricRows: number,
  localizationInput?: ReportLocalization
): string {
  const localization = normalizeReportLocalization(localizationInput);
  const strings = localization.strings;
  const dateLocale = Intl.DateTimeFormat.supportedLocalesOf([localization.locale])[0] ?? "en-US";
  return `<!doctype html>
<html lang="${htmlEscape(localization.locale)}" dir="${htmlEscape(localization.direction)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LumaTrace · ${htmlEscape(strings.title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #1f2933; background: #f5f7fa; }
    body { margin: 0; padding: 24px; }
    main { max-width: 1180px; margin: 0 auto; }
    h1, h2 { margin: 0 0 12px; }
    section { margin: 0 0 24px; }
    .panel { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; padding: 16px; }
    .meta-grid, .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric-card { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; padding: 12px; margin: 0; }
    .metric-card div { color: #52606d; font-size: 12px; text-transform: uppercase; }
    .metric-card strong { display: inline-block; margin-top: 6px; font-size: 22px; }
    .metric-card span { color: #52606d; font-size: 12px; }
    .conclusion-panel { border-inline-start: 5px solid #0f9f95; background: #f0fdfa; }
    .conclusion-primary { margin-top: 0; font-size: 18px; font-weight: 700; color: #12343b; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #d9e2ec; padding: 8px; text-align: start; vertical-align: top; font-size: 13px; }
    th { background: #edf2f7; }
    .note { color: #52606d; }
  </style>
</head>
<body>
<main>
  <section class="panel">
    <h1>LumaTrace · ${htmlEscape(strings.title)}</h1>
    <div class="meta-grid">
      <div><strong>${htmlEscape(strings.session)}</strong><br>${htmlEscape(document.session.name)}</div>
      <div><strong>${htmlEscape(strings.device)}</strong><br>${htmlEscape(document.device.name)}</div>
      <div><strong>${htmlEscape(strings.target)}</strong><br>${htmlEscape(document.target.name)}</div>
      <div><strong>${htmlEscape(strings.generated)}</strong><br>${htmlEscape(new Date(document.generatedAt).toLocaleString(dateLocale))}</div>
      <div><strong>${htmlEscape(strings.rawMetrics)}</strong><br>${htmlEscape(document.rawMetricCount)}</div>
      <div><strong>${htmlEscape(strings.version)}</strong><br>${htmlEscape(document.version)}</div>
    </div>
  </section>

  <section>
    <h2>${htmlEscape(strings.summary)}</h2>
    ${renderSummary(document.summary, localization)}
  </section>

  ${renderFpsExplanation(document, localization)}

  <section>
    <h2>${htmlEscape(strings.markers)}</h2>
    ${renderMarkers(document, localization)}
  </section>

  <section>
    <h2>${htmlEscape(strings.metricAvailability)}</h2>
    ${renderAvailability(document.availability, localization)}
  </section>

  ${renderPcDiagnostics(document, localization)}

  ${renderPerformanceConclusion(document.summary, localization)}
</main>
</body>
</html>`;
}
