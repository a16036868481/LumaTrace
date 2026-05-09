import { describe, expect, it } from "vitest";
import {
  buildDownsampledMetricPreview,
  buildRawMetricPreview,
  chooseReportBucketSizeMs,
  shouldUseDownsampledPreview
} from "../src/utils/reportMetricPreview";

describe("reportMetricPreview", () => {
  it("uses raw preview for short reports without changing missing values", () => {
    const preview = buildRawMetricPreview(
      [
        {
          sessionId: "s1",
          timestampMs: 1000,
          deviceId: "d1",
          targetId: "t1",
          metricName: "cpu_percent",
          value: null,
          unit: "%",
          source: "windows:process-times",
          precision: "estimated",
          confidence: "medium"
        }
      ],
      1
    );

    expect(preview).toMatchObject({
      source: "raw",
      metricCount: 1,
      sampleCount: 1,
      metricStartMs: 1000,
      metricEndMs: 1000
    });
  });

  it("builds downsampled preview ranges from bucket bounds", () => {
    const preview = buildDownsampledMetricPreview(
      [
        {
          sessionId: "s1",
          metricName: "cpu_percent",
          bucketStartMs: 1000,
          bucketEndMs: 2000,
          count: 3,
          avgValue: 20,
          source: "windows:process-times",
          precision: "estimated"
        },
        {
          sessionId: "s1",
          metricName: "memory_mb",
          bucketStartMs: 3000,
          bucketEndMs: 4000,
          count: 2,
          avgValue: 512,
          source: "windows:process-memory",
          precision: "estimated"
        }
      ],
      900,
      1000
    );

    expect(preview).toMatchObject({
      source: "downsampled",
      metricCount: 900,
      sampleCount: 2,
      bucketSizeMs: 1000,
      metricStartMs: 1000,
      metricEndMs: 4000
    });
  });

  it("chooses bounded bucket size and switches only after raw preview limit", () => {
    expect(chooseReportBucketSizeMs({ summary: { durationMs: 120_000 }, cached: true, rawMetricCount: 800 })).toBe(
      1000
    );
    expect(chooseReportBucketSizeMs({ summary: { durationMs: 3_900_000 }, cached: true, rawMetricCount: 800 })).toBe(
      8000
    );
    expect(shouldUseDownsampledPreview({ summary: { durationMs: 1000 }, cached: true, rawMetricCount: 500 })).toBe(
      false
    );
    expect(shouldUseDownsampledPreview({ summary: { durationMs: 1000 }, cached: true, rawMetricCount: 501 })).toBe(
      true
    );
  });
});
