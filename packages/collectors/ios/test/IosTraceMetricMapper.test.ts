import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { METRIC_NAMES } from "@lumatrace/core";
import { parseXctraceCsv } from "../src/parsers/parseXctraceCsv";
import { mapIosTraceRowsToMetrics } from "../src/trace/IosTraceMetricMapper";

function fixture(name: string): string {
  return readFileSync(resolve("../../../tests/fixtures/ios", name), "utf8");
}

const baseOptions = {
  sessionId: "session-ios",
  deviceId: "ios:device",
  targetId: "ios-app:device:com.example.game",
  traceStartedAtMs: 1_700_000_000_000,
  captureId: "capture-1"
};

describe("mapIosTraceRowsToMetrics", () => {
  it("maps matched xctrace rows to MetricEvents", () => {
    const parsed = parseXctraceCsv(fixture("xctrace_csv_sample.csv"));
    const result = mapIosTraceRowsToMetrics(parsed.rows, {
      ...baseOptions,
      target: {
        bundleId: "com.example.game"
      }
    });

    expect(result.match.status).toBe("matched");
    expect(result.match.confidence).toBe("high");
    expect(result.metrics.map((metric) => metric.metricName)).toEqual([
      METRIC_NAMES.FRAME_TIME_MS,
      METRIC_NAMES.FPS,
      METRIC_NAMES.CPU_PERCENT,
      METRIC_NAMES.MEMORY_MB,
      METRIC_NAMES.FRAME_TIME_MS,
      METRIC_NAMES.FPS,
      METRIC_NAMES.CPU_PERCENT,
      METRIC_NAMES.MEMORY_MB
    ]);
    expect(result.metrics[0]).toMatchObject({
      source: "ios:xctrace-csv-import",
      precision: "estimated",
      confidence: "high",
      parserVersion: "ios-xctrace-csv-v1"
    });
    expect(result.metrics[0]?.tags).toMatchObject({
      platform: "ios",
      manualTrace: true,
      bundleId: "com.example.game",
      captureId: "capture-1"
    });
  });

  it("derives fps from per-row frame time, not from aggregate averages", () => {
    const parsed = parseXctraceCsv(fixture("xctrace_csv_frame_time_only_sample.csv"));
    const result = mapIosTraceRowsToMetrics(parsed.rows, {
      ...baseOptions,
      target: {
        bundleId: "com.example.game"
      }
    });
    const fps = result.metrics.filter((metric) => metric.metricName === METRIC_NAMES.FPS);
    const frameTimes = result.metrics.filter((metric) => metric.metricName === METRIC_NAMES.FRAME_TIME_MS);
    expect(frameTimes).toHaveLength(2);
    expect(fps).toHaveLength(2);
    expect(fps[0]?.tags?.derivedFromFrameTime).toBe(true);
    expect(fps[0]?.value).toBeCloseTo(59.988, 2);
  });

  it("does not emit metrics when target matching fails", () => {
    const parsed = parseXctraceCsv(fixture("xctrace_csv_no_target_sample.csv"));
    const result = mapIosTraceRowsToMetrics(parsed.rows, {
      ...baseOptions,
      target: {
        bundleId: "com.example.game"
      }
    });
    expect(result.match.status).toBe("no_match");
    expect(result.metrics).toEqual([]);
  });

  it("does not emit metrics for ambiguous process-name matches", () => {
    const parsed = parseXctraceCsv(fixture("xctrace_csv_ambiguous_process_sample.csv"));
    const result = mapIosTraceRowsToMetrics(parsed.rows, {
      ...baseOptions,
      target: {
        processName: "ExampleGame"
      }
    });
    expect(result.match.status).toBe("ambiguous");
    expect(result.metrics).toEqual([]);
  });

  it("does not fabricate frame_time_ms from average fps", () => {
    const parsed = parseXctraceCsv(fixture("xctrace_csv_average_only_sample.csv"));
    const result = mapIosTraceRowsToMetrics(parsed.rows, {
      ...baseOptions,
      target: {
        bundleId: "com.example.game"
      }
    });
    expect(result.metrics).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("supported per-row metric columns"))).toBe(true);
  });
});
