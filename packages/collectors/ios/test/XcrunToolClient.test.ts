import { describe, expect, it } from "vitest";
import type { CommandRunner, CommandResult } from "@lumatrace/core";
import { parseXcrunVersion, XcrunToolClient } from "../src/tools/XcrunToolClient";

class FakeRunner implements Pick<CommandRunner, "run"> {
  readonly calls: Array<{ command: string; args?: readonly string[] }> = [];

  constructor(private readonly result: Partial<CommandResult>) {}

  async run(options: { command: string; args?: readonly string[] }): Promise<CommandResult> {
    this.calls.push(options);
    return {
      command: options.command,
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
      sanitizedCommand: options.command,
      sanitizedStdout: "",
      sanitizedStderr: "",
      ...this.result
    };
  }
}

describe("XcrunToolClient", () => {
  it("parses xcrun version", () => {
    expect(parseXcrunVersion("xcrun version 70.0.0")).toBe("70.0.0");
  });

  it("reports unsupported on non-macOS without running commands", async () => {
    const runner = new FakeRunner({});
    const client = new XcrunToolClient({
      platform: "win32",
      commandRunner: runner as unknown as CommandRunner
    });
    const status = await client.getToolStatus();
    expect(status.toolStatus.status).toBe("unsupported");
    expect(runner.calls).toEqual([]);
  });
});
