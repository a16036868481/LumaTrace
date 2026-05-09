import type { ReportGenerator } from "@lumatrace/report";
import { AppError } from "../utils/errors";

export type ExportFormat = "csv" | "json" | "html";

export interface ExportResult {
  format: ExportFormat;
  contentType: string;
  body: string;
}

function parseFormat(format: string | undefined): ExportFormat {
  if (format === "csv" || format === "json" || format === "html") {
    return format;
  }

  throw new AppError("EXPORT_FORMAT_UNSUPPORTED", "Export format is unsupported.", 400, {
    format
  });
}

export class ExportService {
  private readonly reportGenerator: ReportGenerator;

  constructor(reportGenerator: ReportGenerator) {
    this.reportGenerator = reportGenerator;
  }

  exportSession(sessionId: string, formatValue: string | undefined): ExportResult {
    const format = parseFormat(formatValue);
    const report = this.reportGenerator.generateFromStorage(sessionId);

    if (format === "json") {
      return {
        format,
        contentType: "application/json; charset=utf-8",
        body: report.json
      };
    }

    if (format === "csv") {
      return {
        format,
        contentType: "text/csv; charset=utf-8",
        body: report.csv
      };
    }

    return {
      format,
      contentType: "text/html; charset=utf-8",
      body: report.html
    };
  }
}
