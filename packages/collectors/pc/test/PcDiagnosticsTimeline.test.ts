import { describe, expect, it } from "vitest";
import { PcDiagnosticsTimeline } from "../src";

describe("PcDiagnosticsTimeline", () => {
  it("sorts, filters, summarizes, and sanitizes", () => {
    const timeline = new PcDiagnosticsTimeline();
    timeline.add({
      id: "late",
      timestampMs: 20,
      sessionId: "s1",
      level: "warn",
      category: "process",
      code: "PROCESS_EXITED",
      message: "exited",
      details: { executablePath: "C:\\Users\\alice\\Game.exe", commandLine: "secret token=abc" }
    });
    timeline.add({
      id: "early",
      timestampMs: 10,
      sessionId: "s1",
      level: "info",
      category: "cpu",
      code: "CPU_BASELINE_ONLY",
      message: "baseline"
    });
    expect(timeline.list().map((event) => event.id)).toEqual(["early", "late"]);
    expect(timeline.list({ category: "process" })).toHaveLength(1);
    expect(JSON.stringify(timeline.list())).not.toContain("C:\\Users\\alice");
    expect(JSON.stringify(timeline.list())).not.toContain("token=abc");
    expect(timeline.summarize("s1").byCode.PROCESS_EXITED).toBe(1);
  });
});
