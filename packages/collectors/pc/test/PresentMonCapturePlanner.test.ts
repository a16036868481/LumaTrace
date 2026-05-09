import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresentMonCapturePlan, detectPresentMonCompatibility, type PresentMonToolStatus } from "../src";

const target = { pid: 4321, name: "Game.exe", startTimeMs: 100 };
const availableTool: PresentMonToolStatus = {
  presentMonPath: "C:\\Tools\\PresentMon.exe",
  toolStatus: { toolName: "PresentMon", status: "available", version: "2.2.0" }
};

function basePlan(overrides: Partial<Parameters<typeof buildPresentMonCapturePlan>[0]> = {}) {
  return buildPresentMonCapturePlan({
    tool: availableTool,
    compatibility: detectPresentMonCompatibility(
      "PresentMon version 2.2.0",
      "--output_file --timed --process_id --process_name --stop_existing_session"
    ),
    target,
    sessionId: "session",
    deviceId: "pc-local:windows",
    targetId: "target",
    outputFilePath: path.join("C:\\Temp", "capture.csv"),
    ...overrides
  });
}

describe("PresentMonCapturePlanner", () => {
  it("rejects missing tools and unsupported output", () => {
    const missing = basePlan({
      tool: { toolStatus: { toolName: "PresentMon", status: "missing", reason: "missing" } }
    });
    expect(missing.canCapture).toBe(false);
    expect(missing.diagnostics.some((event) => event.code === "PRESENTMON_MISSING")).toBe(true);

    const unsupported = basePlan({
      compatibility: detectPresentMonCompatibility("", "--process_name")
    });
    expect(unsupported.canCapture).toBe(false);
  });

  it("plans PID mode and clamps duration", () => {
    const plan = basePlan({ captureDurationMs: 999999 });
    expect(plan.canCapture).toBe(true);
    expect(plan.durationMs).toBe(120000);
    expect(plan.command?.args).toContain("--process_id");
  });

  it("falls back to process name when PID mode is unsupported and records retention", () => {
    const plan = basePlan({
      compatibility: detectPresentMonCompatibility("", "--output_file --timed --process_name"),
      targetMode: "pid",
      keepPresentMonCsv: true
    });
    expect(plan.targetMode).toBe("process_name");
    expect(plan.warnings.join(" ")).toMatch(/falling back/i);
    expect(plan.expectedCsvRetention.mode).toBe("keep_user_requested");
  });

  it("rejects unsafe output file paths", () => {
    const plan = basePlan({ outputFilePath: "C:\\Temp\\capture.csv&del" });
    expect(plan.canCapture).toBe(false);
    expect(plan.reason).toMatch(/unsafe/i);
  });
});
