import type { MetricEvent } from "@lumatrace/core";
import { csvTable } from "../utils/csvEscape";
import { sortMetrics } from "../utils/metricGrouping";

export const CSV_HEADERS = [
  "timestampMs",
  "monotonicMs",
  "sequence",
  "metricName",
  "value",
  "unit",
  "source",
  "precision",
  "confidence",
  "parserVersion",
  "tags"
] as const;

export class CsvExporter {
  export(metrics: readonly MetricEvent[]): string {
    const rows = sortMetrics(metrics).map((event) => [
      event.timestampMs,
      event.monotonicMs,
      event.sequence,
      event.metricName,
      event.value,
      event.unit,
      event.source,
      event.precision,
      event.confidence,
      event.parserVersion,
      event.tags ?? null
    ]);

    return csvTable(CSV_HEADERS, rows);
  }
}
