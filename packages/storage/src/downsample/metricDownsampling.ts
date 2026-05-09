import { average, maxValue, minValue, percentile, type MetricEvent, type MetricPrecision } from "@lumatrace/core";
import type { DownsampledMetricBucket } from "../repositories/MetricRepository";

export interface BuildDownsampledMetricBucketsOptions {
  bucketSizeMs: number;
}

interface BucketAccumulator {
  sessionId: string;
  bucketStartMs: number;
  bucketEndMs: number;
  metricName: string;
  values: number[];
  sources: Set<string>;
  precisions: Set<MetricPrecision>;
}

function bucketKey(event: MetricEvent, bucketStartMs: number): string {
  return `${event.sessionId}\u0000${event.metricName}\u0000${bucketStartMs}`;
}

function sourceForBucket(sources: Set<string>): string | undefined {
  if (sources.size === 0) {
    return undefined;
  }
  if (sources.size === 1) {
    return Array.from(sources)[0];
  }
  return "mixed";
}

function precisionForBucket(precisions: Set<MetricPrecision>): MetricPrecision | undefined {
  if (precisions.size !== 1) {
    return undefined;
  }
  return Array.from(precisions)[0];
}

export function buildDownsampledMetricBuckets(
  events: readonly MetricEvent[],
  options: BuildDownsampledMetricBucketsOptions
): DownsampledMetricBucket[] {
  if (!Number.isFinite(options.bucketSizeMs) || options.bucketSizeMs <= 0) {
    throw new Error("bucketSizeMs must be a positive number.");
  }

  const buckets = new Map<string, BucketAccumulator>();

  for (const event of events) {
    if (typeof event.value !== "number" || !Number.isFinite(event.value)) {
      continue;
    }

    const bucketStartMs =
      Math.floor(event.timestampMs / options.bucketSizeMs) * options.bucketSizeMs;
    const key = bucketKey(event, bucketStartMs);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = {
        sessionId: event.sessionId,
        bucketStartMs,
        bucketEndMs: bucketStartMs + options.bucketSizeMs,
        metricName: event.metricName,
        values: [],
        sources: new Set(),
        precisions: new Set()
      };
      buckets.set(key, bucket);
    }

    bucket.values.push(event.value);
    bucket.sources.add(event.source);
    bucket.precisions.add(event.precision);
  }

  return Array.from(buckets.values())
    .sort((left, right) => {
      if (left.bucketStartMs !== right.bucketStartMs) {
        return left.bucketStartMs - right.bucketStartMs;
      }
      return left.metricName.localeCompare(right.metricName);
    })
    .map((bucket) => {
      const result: DownsampledMetricBucket = {
        sessionId: bucket.sessionId,
        bucketStartMs: bucket.bucketStartMs,
        bucketEndMs: bucket.bucketEndMs,
        metricName: bucket.metricName,
        count: bucket.values.length,
        tags: {
          downsampled: true,
          bucketSizeMs: options.bucketSizeMs
        }
      };

      const min = minValue(bucket.values);
      const max = maxValue(bucket.values);
      const avg = average(bucket.values);
      const p50 = percentile(bucket.values, 50);
      const p95 = percentile(bucket.values, 95);
      const source = sourceForBucket(bucket.sources);
      const precision = precisionForBucket(bucket.precisions);

      if (min !== undefined) {
        result.minValue = min;
      }
      if (max !== undefined) {
        result.maxValue = max;
      }
      if (avg !== undefined) {
        result.avgValue = avg;
      }
      if (p50 !== undefined) {
        result.p50Value = p50;
      }
      if (p95 !== undefined) {
        result.p95Value = p95;
      }
      if (source !== undefined) {
        result.source = source;
      }
      if (precision !== undefined) {
        result.precision = precision;
      }

      return result;
    });
}
