import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPresentMonCaptureCommand,
  parsePresentMonHelpCapabilities
} from "../src";
import { readPcFixture } from "./fixture";

describe("PresentMonCaptureCommand", () => {
  it("builds array args for PID timed capture and sanitizes local paths", () => {
    const command = buildPresentMonCaptureCommand({
      presentMonPath: "C:\\Tools\\PresentMon.exe",
      targetPid: 4321,
      outputFilePath: "C:\\Users\\alice\\AppData\\Local\\Temp\\capture.csv",
      captureDurationMs: 10_500
    });

    expect(command.executable).toBe("C:\\Tools\\PresentMon.exe");
    expect(command.args).toContain("--process_id");
    expect(command.args).toContain("4321");
    expect(command.args).toContain("--output_file");
    expect(command.args).toContain("--terminate_after_timed");
    expect(command.args).toContain("11");
    expect(command.sanitizedPreview).not.toContain("alice");
  });

  it("uses process name mode when PID targeting is unavailable", () => {
    const command = buildPresentMonCaptureCommand({
      presentMonPath: "PresentMon.exe",
      processName: "Game.exe",
      outputFilePath: path.join("C:\\Temp", "capture.csv"),
      captureDurationMs: 1000,
      capabilities: { supportsPidFilter: false, supportsProcessName: true, supportsLongOptions: true }
    });

    expect(command.args).toContain("--process_name");
    expect(command.args).toContain("Game.exe");
    expect(command.args).not.toContain("--process_id");
  });

  it("caps duration and rejects unsafe args", () => {
    const command = buildPresentMonCaptureCommand({
      presentMonPath: "PresentMon.exe",
      processName: "Game.exe",
      outputFilePath: "C:\\Temp\\capture.csv",
      captureDurationMs: 999_999
    });
    expect(command.durationMs).toBe(120_000);

    expect(() =>
      buildPresentMonCaptureCommand({
        presentMonPath: "PresentMon.exe",
        processName: "Game.exe",
        outputFilePath: "C:\\Temp\\capture.csv",
        additionalArgs: ["--output_file", "other.csv"]
      })
    ).toThrow(/override/i);
    expect(() =>
      buildPresentMonCaptureCommand({
        presentMonPath: "PresentMon.exe",
        processName: "Game.exe",
        outputFilePath: "C:\\Temp\\capture.csv",
        additionalArgs: ["--terminate_after_timed"]
      })
    ).toThrow(/override/i);
  });

  it("parses help capability branches", () => {
    const capabilities = parsePresentMonHelpCapabilities(readPcFixture("presentmon_help_sample.txt"));
    expect(capabilities.supportsPidFilter).toBe(true);
    expect(capabilities.supportsProcessName).toBe(true);
    expect(capabilities.supportsLongOptions).toBe(true);
  });
});
