import { describe, expect, it } from "vitest";
import type { CommandResult, CommandRunnerOptions } from "@lumatrace/core";
import { AndroidDiagnosticCollector, runAndroidCommandWithPolicy } from "../src";

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    command: "adb",
    args: [],
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
    sanitizedCommand: "adb devices",
    sanitizedStdout: "",
    sanitizedStderr: "",
    ...overrides
  };
}

describe("Android command timeout policy", () => {
  it("records slow and timeout diagnostics and retries idempotent reads", async () => {
    const diagnostics = new AndroidDiagnosticCollector();
    const calls: CommandRunnerOptions[] = [];
    const runner = {
      async run(options: CommandRunnerOptions) {
        calls.push(options);
        return calls.length === 1
          ? result({ timedOut: true, exitCode: null, durationMs: options.timeoutMs })
          : result({ durationMs: options.timeoutMs - 1 });
      }
    };

    const commandResult = await runAndroidCommandWithPolicy(runner, {
      command: "adb",
      args: ["devices", "-l"],
      policyName: "adb_devices",
      diagnostics
    });

    expect(commandResult.timedOut).toBe(false);
    expect(calls).toHaveLength(2);
    expect(diagnostics.list().map((event) => event.code)).toEqual(
      expect.arrayContaining(["ADB_TIMEOUT", "ADB_COMMAND_RETRY", "ADB_SLOW_COMMAND"])
    );
  });

  it("does not retry side-effect commands and records aborts", async () => {
    const diagnostics = new AndroidDiagnosticCollector();
    const runner = {
      async run() {
        return result({ aborted: true, exitCode: null, durationMs: 10 });
      }
    };

    await runAndroidCommandWithPolicy(runner, {
      command: "adb",
      args: ["shell", "am", "force-stop", "com.example.app"],
      policyName: "force_stop",
      diagnostics
    });

    expect(diagnostics.list().map((event) => event.code)).toEqual(["ADB_COMMAND_ABORTED"]);
  });
});
