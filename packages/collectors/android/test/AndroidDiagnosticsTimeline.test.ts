import { describe, expect, it } from "vitest";
import { AndroidDiagnosticsTimeline } from "../src";

describe("AndroidDiagnosticsTimeline", () => {
  it("adds, sorts, filters, summarizes, and produces report sections", () => {
    const timeline = new AndroidDiagnosticsTimeline();
    timeline.add({
      id: "late",
      timestampMs: 20,
      sessionId: "s1",
      deviceId: "android:d1",
      level: "warn",
      category: "network",
      code: "NETWORK_FALLBACK_DEVICE_LEVEL",
      message: "fallback",
      details: { serial: "ZX1G22ABCDEF" }
    });
    timeline.add({
      id: "early",
      timestampMs: 10,
      sessionId: "s1",
      level: "info",
      category: "process",
      code: "PID_REBOUND",
      message: "rebound"
    });
    timeline.add({
      id: "other",
      timestampMs: 30,
      sessionId: "s2",
      level: "error",
      category: "fps",
      code: "FPS_PROBE_FAILED",
      message: "fps failed"
    });

    expect(timeline.listBySession("s1").map((event) => event.id)).toEqual(["early", "late"]);
    expect(timeline.list({ category: "network" })).toHaveLength(1);
    expect(JSON.stringify(timeline.list())).not.toContain("ZX1G22ABCDEF");

    const summary = timeline.summarize("s1");
    expect(summary.total).toBe(2);
    expect(summary.byLevel.warn).toBe(1);
    expect(summary.byCode.NETWORK_FALLBACK_DEVICE_LEVEL).toBe(1);
    expect(summary.importantEvents).toHaveLength(2);

    const reportSection = timeline.toReportSection("s1");
    expect(reportSection.networkPrecisionNotice).toContain("not target-only");
    expect(reportSection.sourcePrecisionNotices.join(" ")).toContain("Device-level network");
  });
});
