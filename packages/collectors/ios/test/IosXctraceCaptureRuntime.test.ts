import { describe, expect, it } from "vitest";
import type { CommandResult, CommandRunner, ToolStatus } from "@lumatrace/core";
import { IosXctraceCaptureRuntime } from "../src/trace/IosXctraceCaptureRuntime";
import type { IosAppInfo, IosDeviceInfo, IosToolClient, IosToolStatus } from "../src/types";

class FakeToolClient implements IosToolClient {
  constructor(private readonly status: ToolStatus) {}

  async getToolStatus(): Promise<IosToolStatus> {
    return {
      toolStatus: this.status,
      ...(this.status.status === "available" ? { xcrunPath: "/usr/bin/xcrun" } : {})
    };
  }

  async listDevices(): Promise<IosDeviceInfo[]> {
    return [];
  }

  async listSimulatorApps(): Promise<IosAppInfo[]> {
    return [];
  }
}

class FakeCommandRunner {
  readonly calls: string[][] = [];

  constructor(private readonly outputs: Array<Partial<CommandResult>>) {}

  async run(options: { args?: readonly string[] }): Promise<CommandResult> {
    this.calls.push([...(options.args ?? [])]);
    const output = this.outputs.shift() ?? {};
    return {
      command: "/usr/bin/xcrun",
      args: [...(options.args ?? [])],
      stdout: "",
      stderr: "",
      exitCode: 0,
      signal: null,
      startTimeMs: 1,
      durationMs: 1,
      timedOut: false,
      aborted: false,
      maxOutputBytes: 1024,
      stdoutTruncated: false,
      stderrTruncated: false,
      sanitizedCommand: "xcrun",
      sanitizedStdout: "",
      sanitizedStderr: "",
      ...output
    };
  }
}

function runtime(outputs: Array<Partial<CommandResult>>) {
  const runner = new FakeCommandRunner(outputs);
  return {
    runner,
    captureRuntime: new IosXctraceCaptureRuntime({
      toolClient: new FakeToolClient({
        toolName: "xcrun",
        status: "available"
      }),
      commandRunner: runner as unknown as CommandRunner,
      now: () => 1_700_000_000_000
    })
  };
}

describe("IosXctraceCaptureRuntime", () => {
  it("returns unsupported when xcrun is missing", async () => {
    const captureRuntime = new IosXctraceCaptureRuntime({
      toolClient: new FakeToolClient({
        toolName: "xcrun",
        status: "missing",
        reason: "missing"
      })
    });
    const result = await captureRuntime.capture({
      sessionId: "session",
      deviceId: "ios:device",
      targetId: "target",
      udid: "00008110-001C195E0E91801E"
    });
    expect(result.status).toBe("unsupported");
    expect(JSON.stringify(result.diagnostics)).not.toContain("00008110-001C195E0E91801E");
  });

  it("records trace and returns toc-only status without export XPath", async () => {
    const { captureRuntime, runner } = runtime([
      { stdout: "recorded", sanitizedStdout: "recorded" },
      { stdout: "<trace-toc />", sanitizedStdout: "<trace-toc />" }
    ]);
    const result = await captureRuntime.capture({
      sessionId: "session",
      deviceId: "ios:device",
      targetId: "target",
      udid: "00008110-001C195E0E91801E",
      target: {
        bundleId: "com.example.game"
      }
    });
    expect(result.status).toBe("trace_recorded");
    expect(result.metricCount).toBe(0);
    expect(runner.calls[0]).toContain("record");
    expect(runner.calls[1]).toContain("export");
    expect(JSON.stringify(result.diagnostics)).not.toContain("00008110-001C195E0E91801E");
  });

  it("exports configured rows and maps target-matched metrics", async () => {
    const csv = [
      "Time (s),Process,Bundle Identifier,PID,FPS,Frame Time (ms)",
      "0.000,ExampleGame,com.example.game,42,60,16.67",
      "0.016,ExampleGame,com.example.game,42,58,17.2"
    ].join("\n");
    const { captureRuntime } = runtime([
      { stdout: "recorded", sanitizedStdout: "recorded" },
      { stdout: "<trace-toc />", sanitizedStdout: "<trace-toc />" },
      { stdout: csv, sanitizedStdout: csv }
    ]);
    const result = await captureRuntime.capture({
      sessionId: "session",
      deviceId: "ios:device",
      targetId: "target",
      udid: "00008110-001C195E0E91801E",
      target: {
        bundleId: "com.example.game"
      },
      exportXPath: "/trace-toc/run/data/table",
      captureId: "capture"
    });
    expect(result.status).toBe("success");
    expect(result.rawRowCount).toBe(2);
    expect(result.matchedRowCount).toBe(2);
    expect(result.metrics.some((metric) => metric.metricName === "fps")).toBe(true);
    expect(result.metrics.every((metric) => metric.source === "ios:xctrace-csv-import")).toBe(true);
  });

  it("does not emit metrics when export has no target rows", async () => {
    const csv = [
      "Time (s),Process,Bundle Identifier,PID,FPS,Frame Time (ms)",
      "0.000,Other,com.example.other,99,60,16.67"
    ].join("\n");
    const { captureRuntime } = runtime([
      { stdout: "recorded", sanitizedStdout: "recorded" },
      { stdout: "<trace-toc />", sanitizedStdout: "<trace-toc />" },
      { stdout: csv, sanitizedStdout: csv }
    ]);
    const result = await captureRuntime.capture({
      sessionId: "session",
      deviceId: "ios:device",
      targetId: "target",
      udid: "00008110-001C195E0E91801E",
      target: {
        bundleId: "com.example.game"
      },
      exportXPath: "/trace-toc/run/data/table"
    });
    expect(result.status).toBe("no_data");
    expect(result.metrics).toHaveLength(0);
  });

  it("returns failed without stack traces when record fails", async () => {
    const { captureRuntime } = runtime([
      {
        exitCode: 1,
        stderr: "Error: token=secret\n    at /Users/alice/project/file.js:1",
        sanitizedStderr: "Error: token=<redacted>\n<stack-frame>"
      }
    ]);
    const result = await captureRuntime.capture({
      sessionId: "session",
      deviceId: "ios:device",
      targetId: "target",
      udid: "00008110-001C195E0E91801E"
    });
    expect(result.status).toBe("failed");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("/Users/alice");
  });
});
