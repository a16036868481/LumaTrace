import type { MetricEvent } from "@lumatrace/core";
import {
  buildDownsampledMetricBuckets,
  type DownsampledMetricBucket,
  type MetricRepository,
  type RawMetricQueryOptions
} from "@lumatrace/storage";

export interface MetricQueryInput {
  fromTimestampMs?: number;
  toTimestampMs?: number;
  metricNames?: string[];
  limit?: number;
  offset?: number;
}

export interface DownsampledMetricQueryInput extends MetricQueryInput {
  bucketSizeMs: number;
}

export class MetricService {
  private readonly metricRepository: MetricRepository;

  constructor(metricRepository: MetricRepository) {
    this.metricRepository = metricRepository;
  }

  queryMetrics(sessionId: string, query: MetricQueryInput): MetricEvent[] {
    const options: RawMetricQueryOptions = {
      sessionId,
      limit: Math.min(query.limit ?? 1000, 10000),
      offset: query.offset ?? 0
    };

    if (query.fromTimestampMs !== undefined) {
      options.fromTimestampMs = query.fromTimestampMs;
    }
    if (query.toTimestampMs !== undefined) {
      options.toTimestampMs = query.toTimestampMs;
    }
    if (query.metricNames !== undefined && query.metricNames.length > 0) {
      options.metricNames = query.metricNames;
    }

    return this.metricRepository.queryRaw(options);
  }

  queryDownsampledMetrics(
    sessionId: string,
    query: DownsampledMetricQueryInput
  ): DownsampledMetricBucket[] {
    const rawOptions: RawMetricQueryOptions = {
      sessionId
    };

    if (query.fromTimestampMs !== undefined) {
      rawOptions.fromTimestampMs = query.fromTimestampMs;
    }
    if (query.toTimestampMs !== undefined) {
      rawOptions.toTimestampMs = query.toTimestampMs;
    }
    if (query.metricNames !== undefined && query.metricNames.length > 0) {
      rawOptions.metricNames = query.metricNames;
    }

    const buckets = buildDownsampledMetricBuckets(this.metricRepository.queryRaw(rawOptions), {
      bucketSizeMs: query.bucketSizeMs
    });
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 1000, 10000);
    return buckets.slice(offset, offset + limit);
  }

  countMetrics(sessionId: string): number {
    return this.metricRepository.countRaw(sessionId);
  }
}
