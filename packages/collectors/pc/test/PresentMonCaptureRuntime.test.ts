import type { CommandResult, CommandRunnerOptions } from "@lumatrace/core";
import { describe, expect, it } from "vitest";
import {
  PcDiagnosticsTimeline,
  PresentMonCaptureRuntime,
  type PresentMonToolLike
} from "../src";
import { readPcFixture } from "./fixture";

function availableTool(): PresentMonToolLike {
  return {
    async findPresentMon() {
      return {
        presentMonPath: "C:\\Tools\\PresentMon.exe",
        toolStatus: {
          toolName: "PresentMon",
          status: "available",
          version: "2.0.0"
        }
      };
    }
  };
}

function missingTool(): PresentMonToolLike {
  return {
    async findPresentMon() {
      return {
        toolStatus: {
          toolName: "PresentMon",
          status: "missing",
          reason: "missing"
        }
      };
    }
  };
}

function commandResult(options: CommandRunnerOptions, overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    command: options.command,
    args: options.args ?? [],
    stdout: readPcFixture("presentmon_console_capture_success.txt"),
    stderr: "",
    exitCode: 0,
    signal: null,
    startTimeMs: 1000,
    durationMs: 25,
    timedOut: false,
    aborted: false,
    maxOutputBytes: options.maxOutputBytes ?? 1024,
    stdoutTruncated: false,
    stderrTruncated: false,
    sanitizedCommand: [options.command, ...(options.args ?? [])].join(" "),
    sanitizedStdout: readPcFixture("presentmon_console_capture_success.txt"),
    sanitizedStderr: "",
    ...overrides
  };
}

function target() {
  return {
    pid: 4321,
    name: "Game.exe",
    startTimeMs: 100,
    workingSetBytes: 1024
  };
}

describe("PresentMonCaptureRuntime", () => {
  it("returns failed diagnostics when PresentMon is missing", async () => {
    const diagnostics = new PcDiagnosticsTimeline();
    const runtime = new PresentMonCaptureRuntime({
      presentMonTool: missingTool(),
      diagnosticsTimeline: diagnostics
    });
    const result = await runtime.capture({
      sessionId: "session",
      deviceId: "pc-local:windows",
      targetId: "target",
      target: target()
    });
    expect(result.status).toBe("failed");
    expect(result.metrics).toHaveLength(0);
    expect(diagnostics.listBySession("session").some((event) => event.code === "PRESENTMON_MISSING")).toBe(true);
  });

  it("captures, parses, matches, and maps PresentMon metrics only on target match", async () => {
    const diagnostics = new PcDiagnosticsTimeline();
    const runner = {
      async run(options: CommandRunnerOptions) {
        expect(options.args).toContain("--process_id");
        return commandResult(options);
      }
    };
    const runtime = new PresentMonCaptureRuntime({
      commandRunner: runner,
      presentMonTool: availableTool(),
      diagnosticsTimeline: diagnostics,
      readFileText: async () => readPcFixture("presentmon_csv_pid_match_sample.csv")
    });
    const result = await runtime.capture({
      sessionId: "session",
      deviceId: "pc-local:windows",
      targetId: "target",
      target: target(),
      captureDurationMs: 1000
    });
    expect(result.status).toBe("success");
    expect(result.rawRowCount).toBe(3);
    expect(result.matchedRowCount).toBe(3);
    expect(result.metrics.some((event) => event.metricName === "fps")).toBe(true);
    expect(result.metrics.some((event) => event.metricName === "frame_time_ms")).toBe(true);
  });

  it("returns no_data for missing CSV, empty CSV, no target rows, and ambiguity", async () => {
    const base = {
      commandRunner: { async run(options: CommandRunnerOptions) { return commandResult(options); } },
      presentMonTool: availableTool(),
      diagnosticsTimeline: new PcDiagnosticsTimeline()
    };

    const missing = await new PresentMonCaptureRuntime({
      ...base,
      readFileText: async () => {
        throw new Error("missing");
      }
    }).capture({ sessionId: "missing", deviceId: "pc", targetId: "target", target: target() });
    expect(missing.status).toBe("no_data");

    const empty = await new PresentMonCaptureRuntime({
      ...base,
      readFileText: async () => readPcFixture("presentmon_csv_empty_sample.csv")
    }).capture({ sessionId: "empty", deviceId: "pc", targetId: "target", target: target() });
    expect(empty.status).toBe("no_data");

    const noTarget = await new PresentMonCaptureRuntime({
      ...base,
      readFileText: async () => readPcFixture("presentmon_csv_no_target_sample.csv")
    }).capture({ sessionId: "no-target", deviceId: "pc", targetId: "target", target: target() });
    expect(noTarget.metrics).toHaveLength(0);

    const ambiguous = await new PresentMonCaptureRuntime({
      ...base,
      readFileText: async () => readPcFixture("presentmon_csv_multi_process_sample.csv")
    }).capture({
      sessionId: "ambiguous",
      deviceId: "pc",
      targetId: "target",
      target: { ...target(), pid: 1111 }
    });
    expect(ambiguous.status).toBe("no_data");
  });

  it("surfaces permission warnings and abort status", async () => {
    const permission = await new PresentMonCaptureRuntime({
      commandRunner: {
        async run(options: CommandRunnerOptions) {
          return commandResult(options, {
            stdout: readPcFixture("presentmon_console_permission_warning.txt"),
            sanitizedStdout: readPcFixture("presentmon_console_permission_warning.txt")
          });
        }
      },
      presentMonTool: availableTool(),
      diagnosticsTimeline: new PcDiagnosticsTimeline(),
      readFileText: async () => readPcFixture("presentmon_csv_pid_match_sample.csv")
    }).capture({ sessionId: "permission", deviceId: "pc", targetId: "target", target: target() });
    expect(permission.warnings.join(" ")).toMatch(/permission/i);

    const runtime = new PresentMonCaptureRuntime({
      commandRunner: {
        async run(options: CommandRunnerOptions) {
          return commandResult(options, { aborted: true, exitCode: null });
        }
      },
      presentMonTool: availableTool(),
      diagnosticsTimeline: new PcDiagnosticsTimeline()
    });
    const aborted = await runtime.capture({ sessionId: "abort", deviceId: "pc", targetId: "target", target: target() });
    expect(aborted.status).toBe("aborted");
  });
});
