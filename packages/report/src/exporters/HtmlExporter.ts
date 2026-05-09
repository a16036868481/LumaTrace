import type { ReportDocument } from "../types";
import { renderReportHtml } from "../templates/reportHtml";

export interface HtmlExportOptions {
  includeRawMetricsInHtml?: boolean;
  maxHtmlMetricRows?: number;
}

export class HtmlExporter {
  export(document: ReportDocument, options: HtmlExportOptions = {}): string {
    const includeRawMetricsInHtml = options.includeRawMetricsInHtml ?? false;
    const maxHtmlMetricRows = options.maxHtmlMetricRows ?? 500;
    const htmlDocument: ReportDocument = includeRawMetricsInHtml
      ? document
      : {
          ...document,
          metrics: []
        };

    return renderReportHtml(htmlDocument, maxHtmlMetricRows);
  }
}
