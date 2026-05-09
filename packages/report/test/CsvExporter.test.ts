import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type MetricEvent } from "@lumatrace/core";
import { CsvExporter } from "../src";

function metric(overrides: Partial<MetricEvent> = {}): MetricEvent {
  return {
    sessionId: "session-1",
    timestampMs: 1000,
    monotonicMs: 0,
    sequence: 0,
    deviceId: "device-1",
    targetId: "target-1",
    metricName: METRIC_NAMES.FPS,
    value: 60,
    unit: METRIC_UNITS.FPS,
    source: "mock",
    precision: "estimated",
    confidence: "high",
    parserVersion: "test-v1",
    tags: {
      profileName: "janky, game"
    },
    ...overrides
  };
}

describe("CsvExporter", () => {
  it("outputs header and metric rows with stable ordering", () => {
    const csv = new CsvExporter().export([
      metric({ timestampMs: 1000, sequence: 2, metricName: METRIC_NAMES.CPU_PERCENT }),
      metric({ timestampMs: 1000, sequence: 1, metricName: METRIC_NAMES.FPS }),
      metric({ timestampMs: 900, sequence: 3, metricName: METRIC_NAMES.MEMORY_MB })
    ]);
    const lines = csv.trimEnd().split("\n");

    expect(lines[0]).toBe(
      "timestampMs,monotonicMs,sequence,metricName,value,unit,source,precision,confidence,parserVersion,tags"
    );
    expect(lines[1]?.split(",")[3]).toBe(METRIC_NAMES.MEMORY_MB);
    expect(lines[2]?.split(",")[3]).toBe(METRIC_NAMES.FPS);
    expect(lines[3]?.split(",")[3]).toBe(METRIC_NAMES.CPU_PERCENT);
  });

  it("roundtrips tags, leaves null values empty, and escapes special characters", () => {
    const csv = new CsvExporter().export([
      metric({
        value: null,
        metricName: "metric,with,comma",
        parserVersion: "parser \"quoted\"",
        tags: {
          label: "line 1\nline 2"
        }
      })
    ]);

    expect(csv).toContain("metric,with,comma".replace("metric,with,comma", "\"metric,with,comma\""));
    expect(csv).toContain(",,fps,mock,estimated");
    expect(csv).toContain("\"parser \"\"quoted\"\"\"");
    expect(csv).toContain("\"{\"\"label\"\":\"\"line 1\\nline 2\"\"}\"");
  });
});
