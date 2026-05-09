import { describe, expect, it } from "vitest";
import { PresentMonExplicitCaptureAdapter, type PresentMonCaptureResult } from "../src";

describe("PresentMonExplicitCaptureAdapter", () => {
  it("starts capture once and returns captured metrics", async () => {
    let calls = 0;
    const result: PresentMonCaptureResult = {
      status: "success",
      rawRowCount: 1,
      matchedRowCount: 1,
      metrics: [
        {
          sessionId: "session",
          timestampMs: 1,
          monotonicMs: 1,
          sequence: 0,
          deviceId: "pc",
          targetId: "target",
          metricName: "fps",
          value: 60,
          unit: "fps",
          source: "PresentMon:CSV",
          precision: "estimated",
          confidence: "high"
        }
      ],
      diagnostics: [],
      warnings: [],
      durationMs: 1,
      source: "PresentMon"
    };
    const adapter = new PresentMonExplicitCaptureAdapter(
      {
        async capture() {
          calls += 1;
          return result;
        },
        async abort() {
          // No-op.
        }
      },
      {
        sessionId: "session",
        deviceId: "pc",
        targetId: "target",
        target: { pid: 1, name: "Game.exe" }
      }
    );

    await adapter.startCapture();
    await adapter.startCapture();
    expect(await adapter.stopCapture()).toHaveLength(1);
    expect(calls).toBe(1);
  });
});
