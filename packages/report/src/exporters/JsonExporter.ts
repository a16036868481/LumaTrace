import type { ReportDocument } from "../types";

export interface JsonExportOptions {
  includeRawMetricsInJson?: boolean;
}

export class JsonExporter {
  export(document: ReportDocument, options: JsonExportOptions = {}): string {
    const includeRawMetricsInJson = options.includeRawMetricsInJson ?? true;
    const output = includeRawMetricsInJson
      ? document
      : {
          ...document,
          metrics: undefined
        };

    return JSON.stringify(output, undefined, 2);
  }
}
