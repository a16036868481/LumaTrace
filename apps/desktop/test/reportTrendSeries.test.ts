import { describe, expect, it } from "vitest";
import {
  bucketToTrendPoint,
  buildReportTrendSeriesFromBuckets,
  buildReportTrendSeriesFromRawMetrics
} from "../src/utils/reportTrendSeries";

describe("reportTrendSeries", () => {
  it("maps downsampled bucket averages without fabricating missing values", () => {
    expect(
      bucketToTrendPoint({
        sessionId: "s1",
        metricName: "cpu_percent",
        bucketStartMs: 1000,
        bucketEndMs: 2000,
        count: 10,
        avgValue: 25,
        source: "mixed",
        precision: "estimated"
      })
    ).toMatchObject({
      timestampMs: 1500,
      value: 25,
      source: "mixed",
      precision: "estimated"
    });

    expect(
      bucketToTrendPoint({
        sessionId: "s1",
        metricName: "cpu_percent",
        bucketStartMs: 1000,
        bucketEndMs: 2000,
        count: 10
      })
    ).toBeNull();
  });

  it("groups bucket series by chart metric name", () => {
    const state = buildReportTrendSeriesFromBuckets([
      {
        sessionId: "s1",
        metricName: "memory_mb",
        bucketStartMs: 2000,
        bucketEndMs: 3000,
        count: 4,
        avgValue: 512,
        source: "windows:process-memory",
        precision: "estimated"
      },
      {
        sessionId: "s1",
        metricName: "not_charted",
        bucketStartMs: 1000,
        bucketEndMs: 2000,
        count: 4,
        avgValue: 1
      }
    ]);

    expect(state.memory_mb).toHaveLength(1);
    expect(state.not_charted).toBeUndefined();
  });

  it("normalizes raw CPU values for report trends", () => {
    const state = buildReportTrendSeriesFromRawMetrics([
      {
        sessionId: "s1",
        timestampMs: 1000,
        deviceId: "d1",
        targetId: "t1",
        metricName: "cpu_percent",
        value: 240,
        unit: "%",
        source: "windows:process-times",
        precision: "estimated",
        confidence: "medium",
        tags: {
          normalizedPercent: 30
        }
      }
    ]);

    expect(state.cpu_percent?.[0]?.value).toBe(30);
  });
});
