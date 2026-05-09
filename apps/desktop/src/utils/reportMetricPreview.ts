import type { DownsampledMetricBucket, MetricEvent, SessionReportResponse } from "../api/types";

export const REPORT_RAW_METRIC_LIMIT = 500;
export const REPORT_TARGET_BUCKET_COUNT = 500;
export const REPORT_MAX_DOWNSAMPLED_BUCKETS = 10_000;

export interface ReportMetricPreview {
  source: "raw" | "downsampled";
  metricCount: number;
  sampleCount: number;
  metricStartMs?: number;
  metricEndMs?: number;
  bucketSizeMs?: number;
}

function finiteNumbers(values: Array<number | undefined>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function chooseReportBucketSizeMs(report: SessionReportResponse): number {
  const durationMs = report.summary.durationMs;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
    return 1000;
  }

  const targetBucketMs = Math.ceil(durationMs / REPORT_TARGET_BUCKET_COUNT);
  return Math.min(Math.max(Math.ceil(targetBucketMs / 1000) * 1000, 1000), 3_600_000);
}

export function buildRawMetricPreview(
  metrics: readonly MetricEvent[],
  totalMetricCount = metrics.length
): ReportMetricPreview {
  const timestamps = finiteNumbers(metrics.map((metric) => metric.timestampMs)).sort((a, b) => a - b);
  const preview: ReportMetricPreview = {
    source: "raw",
    metricCount: totalMetricCount,
    sampleCount: metrics.length
  };
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  if (first !== undefined) {
    preview.metricStartMs = first;
  }
  if (last !== undefined) {
    preview.metricEndMs = last;
  }
  return preview;
}

export function buildDownsampledMetricPreview(
  buckets: readonly DownsampledMetricBucket[],
  totalMetricCount: number,
  bucketSizeMs: number
): ReportMetricPreview {
  const starts = finiteNumbers(buckets.map((bucket) => bucket.bucketStartMs));
  const ends = finiteNumbers(buckets.map((bucket) => bucket.bucketEndMs));
  const preview: ReportMetricPreview = {
    source: "downsampled",
    metricCount: totalMetricCount,
    sampleCount: buckets.length,
    bucketSizeMs
  };
  const first = starts.length > 0 ? Math.min(...starts) : undefined;
  const last = ends.length > 0 ? Math.max(...ends) : undefined;
  if (first !== undefined) {
    preview.metricStartMs = first;
  }
  if (last !== undefined) {
    preview.metricEndMs = last;
  }
  return preview;
}

export function shouldUseDownsampledPreview(report: SessionReportResponse): boolean {
  return report.rawMetricCount > REPORT_RAW_METRIC_LIMIT;
}
