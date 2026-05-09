import { describe, expect, it } from "vitest";
import type { MetricEvent } from "@lumatrace/core";
import { buildDownsampledMetricBuckets } from "../src";

function metric(overrides: Partial<MetricEvent> = {}): MetricEvent {
  return {
    sessionId: "session-1",
    timestampMs: 1000,
    deviceId: "device-1",
    targetId: "target-1",
    metricName: "fps",
    value: 60,
    unit: "fps",
    source: "mock",
    precision: "estimated",
    confidence: "high",
    ...overrides
  };
}

describe("buildDownsampledMetricBuckets", () => {
  it("groups numeric metrics into stable buckets without fabricating null values", () => {
    const buckets = buildDownsampledMetricBuckets(
      [
        metric({ timestampMs: 1000, value: 50 }),
        metric({ timestampMs: 1200, value: 70 }),
        metric({ timestampMs: 1400, value: null }),
        metric({ timestampMs: 2100, value: 30 })
      ],
      { bucketSizeMs: 1000 }
    );

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      bucketStartMs: 1000,
      bucketEndMs: 2000,
      metricName: "fps",
      count: 2,
      minValue: 50,
      maxValue: 70,
      avgValue: 60,
      p50Value: 60,
      p95Value: 69,
      source: "mock",
      precision: "estimated",
      tags: {
        downsampled: true,
        bucketSizeMs: 1000
      }
    });
    expect(buckets[1]).toMatchObject({
      bucketStartMs: 2000,
      count: 1,
      avgValue: 30
    });
  });

  it("keeps metric names separate and marks mixed source/precision honestly", () => {
    const buckets = buildDownsampledMetricBuckets(
      [
        metric({ metricName: "fps", value: 60, source: "a", precision: "estimated" }),
        metric({ metricName: "fps", value: 30, source: "b", precision: "device_level" }),
        metric({ metricName: "cpu_percent", value: 10, source: "a", precision: "estimated" })
      ],
      { bucketSizeMs: 1000 }
    );

    expect(buckets.map((bucket) => bucket.metricName)).toEqual(["cpu_percent", "fps"]);
    const fps = buckets.find((bucket) => bucket.metricName === "fps");
    expect(fps?.source).toBe("mixed");
    expect(fps?.precision).toBeUndefined();
  });

  it("rejects invalid bucket sizes", () => {
    expect(() => buildDownsampledMetricBuckets([metric()], { bucketSizeMs: 0 })).toThrow(
      /bucketSizeMs/
    );
  });
});
