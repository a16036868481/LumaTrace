export { ReportGenerator, buildSummary } from "./ReportGenerator";
export { CsvExporter, CSV_HEADERS } from "./exporters/CsvExporter";
export { JsonExporter } from "./exporters/JsonExporter";
export type { JsonExportOptions } from "./exporters/JsonExporter";
export { HtmlExporter } from "./exporters/HtmlExporter";
export type { HtmlExportOptions } from "./exporters/HtmlExporter";
export { renderReportHtml } from "./templates/reportHtml";
export {
  DEFAULT_REPORT_LOCALIZATION,
  localizationFromSessionConfig,
  normalizeReportLocalization
} from "./localization/reportLocalization";
export { csvEscape, csvRow, csvTable } from "./utils/csvEscape";
export { formatValue, htmlEscape } from "./utils/htmlEscape";
export { sanitizeFileBaseName, writeReportFiles } from "./utils/fileWriter";
export {
  cpuMetricValues,
  hasMetric,
  inferRefreshRate,
  metricValues,
  sortMetrics
} from "./utils/metricGrouping";
export type {
  GeneratedReport,
  ReportBuildResult,
  ReportDocument,
  ReportFilePaths,
  ReportGeneratorDependencies,
  ReportGeneratorOptions,
  ReportInput,
  ReportLocalization,
  ReportLocalizationStrings
} from "./types";
