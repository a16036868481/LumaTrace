import type { MetricAvailability, MetricEvent, ReportSummary, ToolStatus } from "@lumatrace/core";
import type { ReportDocument } from "../types";
import { formatValue, htmlEscape } from "../utils/htmlEscape";
import { sortMetrics } from "../utils/metricGrouping";

const SUMMARY_FIELDS: readonly [keyof ReportSummary, string, string][] = [
  ["durationMs", "Duration", "ms"],
  ["avgFps", "Avg FPS", "fps"],
  ["minFps", "Min FPS", "fps"],
  ["maxFps", "Max FPS", "fps"],
  ["onePercentLowFps", "1% Low", "fps"],
  ["zeroPointOnePercentLowFps", "0.1% Low", "fps"],
  ["p50FrameTimeMs", "P50 Frame", "ms"],
  ["p90FrameTimeMs", "P90 Frame", "ms"],
  ["p95FrameTimeMs", "P95 Frame", "ms"],
  ["p99FrameTimeMs", "P99 Frame", "ms"],
  ["jankCount", "Jank", "count"],
  ["severeJankCount", "Severe Jank", "count"],
  ["avgCpuPercent", "Avg CPU", "%"],
  ["peakCpuPercent", "Peak CPU", "%"],
  ["avgMemoryMb", "Avg Memory", "MB"],
  ["peakMemoryMb", "Peak Memory", "MB"],
  ["networkRxMb", "Network RX", "MB"],
  ["networkTxMb", "Network TX", "MB"],
  ["batteryDrainPercent", "Battery Drain", "%"],
  ["thermalEvents", "Thermal Events", "count"]
];

function numberDisplay(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return htmlEscape(Number(value.toFixed(2)));
  }

  return formatValue(value);
}

function renderSummary(summary: ReportSummary): string {
  const cards = SUMMARY_FIELDS.map(([field, label, unit]) => {
    const value = summary[field];
    const unitLabel = value === undefined ? "" : ` <span>${htmlEscape(unit)}</span>`;
    return `<section class="metric-card"><div>${htmlEscape(label)}</div><strong>${numberDisplay(
      value
    )}</strong>${unitLabel}</section>`;
  }).join("");

  return `<div class="metric-grid">${cards}</div>`;
}

function renderFpsExplanation(document: ReportDocument): string {
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
  const focusText = hasFps
    ? `1% Low is ${numberDisplay(summary.onePercentLowFps)} fps. This is the average of the slowest 1% FPS samples and is the main stutter indicator for the run.`
    : "FPS stayed N/A for this run because no target-matched frame data was collected.";

  return `<section>
    <h2>FPS Analysis</h2>
    <div class="panel">
      <p><strong>Test window:</strong> ${htmlEscape(startedAt)} - ${htmlEscape(endedAt)}</p>
      <p><strong>Focus:</strong> ${focusText}</p>
      <p><strong>Frame-time view:</strong> P95 ${numberDisplay(summary.p95FrameTimeMs)} ms, P99 ${numberDisplay(
        summary.p99FrameTimeMs
      )} ms, jank ${numberDisplay(summary.jankCount)} frames.</p>
      <p class="note">FPS and frame-time values are calculated only from real metric samples in this session. Missing or unmatched frame data remains N/A and is not filled with 0.</p>
      <p class="note">Frame metric rows used: ${htmlEscape(fpsMetricCount)}</p>
    </div>
  </section>`;
}

function renderMarkers(document: ReportDocument): string {
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
    <thead><tr><th>Timestamp</th><th>Label</th><th>Description</th><th>Tags</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4">N/A</td></tr>`}</tbody>
  </table>`;
}

function renderAvailability(availability: readonly MetricAvailability[]): string {
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
    <thead><tr><th>Metric</th><th>Platform</th><th>Status</th><th>Source</th><th>Reason</th><th>Action</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">N/A</td></tr>`}</tbody>
  </table>`;
}

function renderToolStatus(toolStatus: readonly ToolStatus[]): string {
  const rows = toolStatus
    .map(
      (tool) => `<tr>
        <td>${htmlEscape(tool.toolName)}</td>
        <td>${htmlEscape(tool.status)}</td>
        <td>${htmlEscape(tool.version)}</td>
        <td>${htmlEscape(tool.path)}</td>
        <td>${htmlEscape(tool.reason)}</td>
        <td>${htmlEscape(tool.suggestedAction)}</td>
      </tr>`
    )
    .join("");

  return `<table>
    <thead><tr><th>Tool</th><th>Status</th><th>Version</th><th>Path</th><th>Reason</th><th>Action</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">N/A</td></tr>`}</tbody>
  </table>`;
}

function renderAndroidDiagnostics(document: ReportDocument): string {
  const diagnostics = document.androidDiagnostics;
  if (diagnostics === undefined) {
    return "";
  }

  const notices = [...diagnostics.sourcePrecisionNotices, ...diagnostics.fallbackNotices];
  const noticeList =
    notices.length === 0
      ? "<li>N/A</li>"
      : notices.map((notice) => `<li>${htmlEscape(notice)}</li>`).join("");
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
    <h2>Android Diagnostics</h2>
    <div class="panel">
      <p class="note">Android Beta diagnostics are sanitized. LumaTrace does not include logcat or bugreport output by default.</p>
      <ul>${noticeList}</ul>
      <p>Warnings: ${htmlEscape(diagnostics.androidDiagnosticsSummary.warnings)} | Errors: ${htmlEscape(
        diagnostics.androidDiagnosticsSummary.errors
      )}</p>
    </div>
    <table>
      <thead><tr><th>Timestamp</th><th>Level</th><th>Category</th><th>Message</th><th>Details</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">N/A</td></tr>`}</tbody>
    </table>
  </section>`;
}

function renderPcDiagnostics(document: ReportDocument): string {
  const diagnostics = document.pcDiagnostics;
  if (diagnostics === undefined) {
    return "";
  }

  const noticeList =
    diagnostics.sourcePrecisionNotices.length === 0
      ? "<li>N/A</li>"
      : diagnostics.sourcePrecisionNotices.map((notice) => `<li>${htmlEscape(notice)}</li>`).join("");
  const permissionList =
    diagnostics.permissionNotices.length === 0
      ? "<li>N/A</li>"
      : diagnostics.permissionNotices.map((notice) => `<li>${htmlEscape(notice)}</li>`).join("");
  const noDataList =
    diagnostics.noDataReasons.length === 0
      ? "<li>N/A</li>"
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
    <h2>PC Diagnostics</h2>
    <div class="panel">
      <p class="note">PC Foundation diagnostics are sanitized. Full command lines, user paths, and raw stdout/stderr are not included by default.</p>
      <ul>${noticeList}</ul>
      <p><strong>PresentMon status:</strong> ${htmlEscape(diagnostics.presentMonCaptureStatus ?? "N/A")}</p>
      <p><strong>CSV retention:</strong> ${htmlEscape(diagnostics.csvRetentionSummary ?? "N/A")}</p>
      <p><strong>Permission notices</strong></p>
      <ul>${permissionList}</ul>
      <p><strong>No data reasons</strong></p>
      <ul>${noDataList}</ul>
      <p>Warnings: ${htmlEscape(diagnostics.pcDiagnosticsSummary.warnings)} | Errors: ${htmlEscape(
        diagnostics.pcDiagnosticsSummary.errors
      )}</p>
    </div>
    <table>
      <thead><tr><th>Timestamp</th><th>Level</th><th>Category</th><th>Message</th><th>Details</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">N/A</td></tr>`}</tbody>
    </table>
  </section>`;
}

function renderIosDiagnostics(document: ReportDocument): string {
  const diagnostics = document.iosDiagnostics;
  if (diagnostics === undefined) {
    return "";
  }

  const noticeList =
    diagnostics.sourcePrecisionNotices.length === 0
      ? "<li>N/A</li>"
      : diagnostics.sourcePrecisionNotices.map((notice) => `<li>${htmlEscape(notice)}</li>`).join("");
  const noDataList =
    diagnostics.noDataReasons.length === 0
      ? "<li>N/A</li>"
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
    <h2>iOS Trace Import</h2>
    <div class="panel">
      <p class="note">iOS trace import diagnostics are sanitized. LumaTrace does not include syslog, raw CSV, private logs, tokens, or full local paths.</p>
      <ul>${noticeList}</ul>
      <p><strong>Import status:</strong> ${htmlEscape(diagnostics.importStatus ?? "N/A")}</p>
      <p><strong>No data reasons</strong></p>
      <ul>${noDataList}</ul>
      <p>Warnings: ${htmlEscape(diagnostics.iosDiagnosticsSummary.warnings)} | Errors: ${htmlEscape(
        diagnostics.iosDiagnosticsSummary.errors
      )}</p>
    </div>
    <table>
      <thead><tr><th>Timestamp</th><th>Level</th><th>Category</th><th>Message</th><th>Details</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">N/A</td></tr>`}</tbody>
    </table>
  </section>`;
}

function renderMetricRows(metrics: readonly MetricEvent[], maxRows: number): string {
  const rows = sortMetrics(metrics)
    .slice(0, maxRows)
    .map(
      (event) => `<tr>
        <td>${htmlEscape(event.timestampMs)}</td>
        <td>${htmlEscape(event.monotonicMs)}</td>
        <td>${htmlEscape(event.sequence)}</td>
        <td>${htmlEscape(event.metricName)}</td>
        <td>${htmlEscape(event.value)}</td>
        <td>${htmlEscape(event.unit)}</td>
        <td>${htmlEscape(event.source)}</td>
        <td>${htmlEscape(event.precision)}</td>
        <td>${htmlEscape(event.confidence)}</td>
        <td>${htmlEscape(event.parserVersion)}</td>
        <td>${htmlEscape(event.tags)}</td>
      </tr>`
    )
    .join("");

  return rows || `<tr><td colspan="11">N/A</td></tr>`;
}

export function renderReportHtml(document: ReportDocument, maxHtmlMetricRows: number): string {
  const metrics = document.metrics ?? [];
  const truncated = metrics.length > maxHtmlMetricRows;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LumaTrace Report</title>
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
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #d9e2ec; padding: 8px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #edf2f7; }
    .note { color: #52606d; }
  </style>
</head>
<body>
<main>
  <section class="panel">
    <h1>LumaTrace Report</h1>
    <div class="meta-grid">
      <div><strong>Session</strong><br>${htmlEscape(document.session.name)}</div>
      <div><strong>Device</strong><br>${htmlEscape(document.device.name)}</div>
      <div><strong>Target</strong><br>${htmlEscape(document.target.name)}</div>
      <div><strong>Generated</strong><br>${htmlEscape(new Date(document.generatedAt).toISOString())}</div>
      <div><strong>Raw Metrics</strong><br>${htmlEscape(document.rawMetricCount)}</div>
      <div><strong>Version</strong><br>${htmlEscape(document.version)}</div>
    </div>
  </section>

  <section>
    <h2>Summary</h2>
    ${renderSummary(document.summary)}
  </section>

  ${renderFpsExplanation(document)}

  <section>
    <h2>Markers</h2>
    ${renderMarkers(document)}
  </section>

  <section>
    <h2>Metric Availability</h2>
    ${renderAvailability(document.availability)}
  </section>

  <section>
    <h2>Tool Status</h2>
    ${renderToolStatus(document.toolStatus)}
  </section>

  ${renderAndroidDiagnostics(document)}
  ${renderPcDiagnostics(document)}
  ${renderIosDiagnostics(document)}

  <section>
    <h2>Limitations</h2>
    <ul>${document.limitations.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul>
  </section>

  <section>
    <h2>Metric Samples</h2>
    ${truncated ? `<p class="note">Showing first ${htmlEscape(maxHtmlMetricRows)} of ${htmlEscape(document.rawMetricCount)} metric rows.</p>` : ""}
    <table>
      <thead><tr><th>Timestamp</th><th>Monotonic</th><th>Sequence</th><th>Metric</th><th>Value</th><th>Unit</th><th>Source</th><th>Precision</th><th>Confidence</th><th>Parser</th><th>Tags</th></tr></thead>
      <tbody>${renderMetricRows(metrics, maxHtmlMetricRows)}</tbody>
    </table>
  </section>
</main>
</body>
</html>`;
}
