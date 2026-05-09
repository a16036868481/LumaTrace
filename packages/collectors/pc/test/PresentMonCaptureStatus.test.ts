import { describe, expect, it } from "vitest";
import { PresentMonCaptureStatusTracker } from "../src";

describe("PresentMonCaptureStatusTracker", () => {
  it("tracks stage transitions, progress, and sanitized output path", () => {
    let now = 1000;
    const tracker = new PresentMonCaptureStatusTracker(() => now);
    tracker.update({
      status: "planning",
      sessionId: "session",
      targetId: "target",
      pid: 4321,
      processName: "Game.exe",
      captureDurationMs: 10000
    });
    now = 6000;
    tracker.update({
      status: "capturing",
      outputFilePath: "C:\\Users\\alice\\AppData\\Local\\Temp\\capture.csv"
    });
    const capturing = tracker.getStatus();
    expect(capturing.status).toBe("capturing");
    expect(capturing.progressPercent).toBe(50);
    expect(capturing.outputFilePathSanitized).not.toContain("alice");

    now = 11000;
    tracker.update({ status: "completed", rawRowCount: 5, matchedRowCount: 5, metricCount: 10 });
    expect(tracker.getStatus().status).toBe("completed");
    expect(tracker.getStatus().progressPercent).toBe(100);
  });

  it("stores terminal no_data, permission_limited, failed, and aborted reasons", () => {
    const tracker = new PresentMonCaptureStatusTracker(() => 1);
    for (const status of ["no_data", "permission_limited", "failed", "aborted"] as const) {
      tracker.update({ status, reason: `${status} reason` });
      expect(tracker.getStatus().status).toBe(status);
      expect(tracker.getStatus().reason).toContain(status);
    }
  });
});
