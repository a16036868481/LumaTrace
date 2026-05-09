import { describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CommandResult, CommandRunnerOptions } from "@lumatrace/core";
import { parsePresentMonVersion, PresentMonTool } from "../src";
import { readPcFixture } from "./fixture";

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    command: "PresentMon.exe",
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
    sanitizedCommand: "PresentMon --version",
    sanitizedStdout: "",
    sanitizedStderr: "",
    ...overrides
  };
}

describe("PresentMonTool", () => {
  it("parses version output", () => {
    expect(parsePresentMonVersion(readPcFixture("presentmon_version_sample.txt")).version).toBe("2.3.1");
    expect(parsePresentMonVersion("PresentMon 2.4.1\nCapture Target Options:").version).toBe("2.4.1");
  });

  it("returns unsupported on non-Windows and missing without crashing", async () => {
    const unsupported = await new PresentMonTool({ platform: "linux" }).findPresentMon();
    expect(unsupported.toolStatus.status).toBe("unsupported");
    const missing = await new PresentMonTool({ platform: "win32", env: { PATH: "" } }).findPresentMon();
    expect(missing.toolStatus.status).toBe("missing");
  });

  it("runs version command through CommandRunner", async () => {
    const calls: CommandRunnerOptions[] = [];
    const tool = new PresentMonTool({
      platform: "win32",
      commandRunner: {
        async run(options: CommandRunnerOptions) {
          calls.push(options);
          return result({ stdout: "PresentMon version 9.9.9" });
        }
      } as never
    });
    expect((await tool.getPresentMonVersion("PresentMon.exe")).version).toBe("9.9.9");
    expect(calls[0]?.args).toEqual(["--version"]);
  });

  it("parses version from non-zero help banner and discovers WinGet installs", async () => {
    const tempRoot = await mkdtempPath();
    try {
      const packageDir = path.join(
        tempRoot,
        "Microsoft",
        "WinGet",
        "Packages",
        "Intel.PresentMon.Console_Microsoft.Winget.Source_8wekyb3d8bbwe"
      );
      const presentMonPath = path.join(packageDir, "presentmon.exe");
      await mkdir(packageDir, { recursive: true });
      await writeFile(presentMonPath, "");

      const tool = new PresentMonTool({
        platform: "win32",
        env: { PATH: "", LOCALAPPDATA: tempRoot },
        commandRunner: {
          async run() {
            return result({
              exitCode: 1,
              stderr: "error: unrecognized option '--version'.\nPresentMon 2.4.1\nCapture Target Options:"
            });
          }
        } as never
      });

      const status = await tool.findPresentMon();
      expect(status.toolStatus.status).toBe("available");
      expect(status.toolStatus.version).toBe("2.4.1");
      expect(status.presentMonPath?.toLowerCase()).toBe(presentMonPath.toLowerCase());
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

async function mkdtempPath(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "lumatrace-presentmon-"));
}
