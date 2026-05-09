import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type ReportSummary } from "@lumatrace/core";
import { JsonExporter, type ReportDocument } from "../src";

function document(metrics = true): ReportDocument {
  const summary: ReportSummary = {
    durationMs: 1000,
    avgFps: 58
  };
  return {
    version: "test",
    generatedAt: 1234,
    session: {
      id: "session-1",
      name: "Session",
      deviceId: "device-1",
      targetId: "target-1",
      sampleIntervalMs: 1000,
      status: "stopped"
    },
    device: {
      id: "device-1",
      platform: "windows",
      name: "Device",
      connectionType: "local",
      capabilities: []
    },
    target: {
      id: "target-1",
      name: "Target",
      type: "game",
      platform: "windows"
    },
    summary,
    markers: [],
    availability: [],
    toolStatus: [],
    rawMetricCount: metrics ? 1 : 0,
    limitations: ["local"],
    metrics: metrics
      ? [
          {
            sessionId: "session-1",
            timestampMs: 1000,
            deviceId: "device-1",
            targetId: "target-1",
            metricName: METRIC_NAMES.FPS,
            value: 60,
            unit: METRIC_UNITS.FPS,
            source: "mock",
            precision: "estimated",
            confidence: "high"
          }
        ]
      : []
  };
}

describe("JsonExporter", () => {
  it("outputs parseable JSON with summary, session, device, target, and metrics by default", () => {
    const parsed = JSON.parse(new JsonExporter().export(document())) as Record<string, unknown>;

    expect(parsed.summary).toMatchObject({ durationMs: 1000, avgFps: 58 });
    expect(parsed.session).toMatchObject({ id: "session-1" });
    expect(parsed.device).toMatchObject({ id: "device-1" });
    expect(parsed.target).toMatchObject({ id: "target-1" });
    expect(parsed.metrics).toBeInstanceOf(Array);
    expect(parsed.limitations).toBeInstanceOf(Array);
  });

  it("omits metrics when includeRawMetricsInJson is false", () => {
    const parsed = JSON.parse(
      new JsonExporter().export(document(), { includeRawMetricsInJson: false })
    ) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(parsed, "metrics")).toBe(false);
  });
});
