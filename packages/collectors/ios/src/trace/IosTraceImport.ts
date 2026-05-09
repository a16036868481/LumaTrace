import { parseXctraceCsv } from "../parsers/parseXctraceCsv";
import type { IosTraceImportResult, IosTraceMetricMappingOptions } from "../types";
import { mapIosTraceRowsToMetrics } from "./IosTraceMetricMapper";

export function importIosXctraceCsvMetrics(
  csvText: string,
  options: IosTraceMetricMappingOptions
): IosTraceImportResult {
  const parse = parseXctraceCsv(csvText);
  const mapping = mapIosTraceRowsToMetrics(parse.rows, options);
  return {
    parse,
    metrics: mapping.metrics,
    warnings: [...parse.warnings, ...mapping.warnings],
    match: mapping.match
  };
}
