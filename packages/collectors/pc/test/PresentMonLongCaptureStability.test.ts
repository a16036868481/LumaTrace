import { describe, expect, it } from "vitest";
import { METRIC_UNITS, type MetricEvent } from "@lumatrace/core";
import { PresentMonLongCaptureSimulator, simulatePcLongSession } from "../src";

function fpsMetric(): MetricEvent {
  return {
    sessionId: "session",
    timestampMs: 1,
    monotonicMs: 1,
    sequence: 1,
    deviceId: "pc-local:windows",
    targetId: "target",
    metricName: "fps",
    value: 60,
    unit: METRIC_UNITS.FPS,
    source: "PresentMon:CSV",
    precision: "estimated",
    confidence: "high",
    tags: { platform: "windows", experimental: true }
  };
}

describe("PresentMon long capture stability", () => {
  it("simulates progress transitions without timers or fake FPS on no_data", async () => {
    const simulator = new PresentMonLongCaptureSimulator({
      resultStatus: "no_data",
      metrics: [fpsMetric()]
    });
    const result = await simulator.capture({
      sessionId: "session",
      deviceId: "pc-local:windows",
      targetId: "target",
      target: { pid: 4321, name: "Game.exe", startTimeMs: 100 },
      captureDurationMs: 10000
    });
    expect(simulator.getStatus().status).toBe("completed");
    expect(result.status).toBe("no_data");
    expect(result.metrics).toHaveLength(0);
  });

  it("can abort a fake long capture and reports PC process edge diagnostics", async () => {
    const simulator = new PresentMonLongCaptureSimulator();
    await simulator.abort();
    expect(simulator.getStatus().status).toBe("aborted");

    const longSession = simulatePcLongSession({
      iterations: 5,
      processMissingAt: 2,
      pidReusedAt: 4
    });
    expect(longSession.metrics.every((event) => event.value !== 0)).toBe(true);
    expect(longSession.diagnostics).toContain("PROCESS_EXITED");
    expect(longSession.diagnostics).toContain("PID_REUSED");
  });
});
