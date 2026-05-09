import { describe, expect, it } from "vitest";
import {
  buildIosXctraceExportCommand,
  buildIosXctraceRecordCommand,
  normalizeIosXctraceDurationMs
} from "../src/trace/IosXctraceCaptureCommand";

describe("IosXctraceCaptureCommand", () => {
  it("builds a safe record command for pid attach", () => {
    const command = buildIosXctraceRecordCommand({
      xcrunPath: "/usr/bin/xcrun",
      udid: "00008110-001C195E0E91801E",
      outputTracePath: "/tmp/lumatrace-ios/capture.trace",
      durationMs: 2500,
      target: {
        pid: 1234,
        bundleId: "com.example.game"
      }
    });

    expect(command.executable).toBe("/usr/bin/xcrun");
    expect(command.args).toContain("--attach");
    expect(command.args).toContain("1234");
    expect(command.args).toContain("2500ms");
    expect(command.sanitizedPreview).toContain("<ios-udid>");
    expect(command.sanitizedPreview).toContain("<trace-path>/capture.trace");
  });

  it("falls back to bundle launch or all-processes without shell strings", () => {
    const launch = buildIosXctraceRecordCommand({
      xcrunPath: "/usr/bin/xcrun",
      udid: "simulator",
      outputTracePath: "/tmp/capture.trace",
      target: {
        bundleId: "com.example.game"
      }
    });
    expect(launch.args.slice(-3)).toEqual(["--launch", "--", "com.example.game"]);

    const allProcesses = buildIosXctraceRecordCommand({
      xcrunPath: "/usr/bin/xcrun",
      udid: "simulator",
      outputTracePath: "/tmp/capture.trace"
    });
    expect(allProcesses.args).toContain("--all-processes");
  });

  it("clamps duration and builds export commands", () => {
    expect(normalizeIosXctraceDurationMs(10)).toBe(1000);
    expect(normalizeIosXctraceDurationMs(999_999)).toBe(120_000);

    const toc = buildIosXctraceExportCommand({
      xcrunPath: "/usr/bin/xcrun",
      inputTracePath: "/tmp/capture.trace",
      toc: true
    });
    expect(toc.args).toContain("--toc");

    const xpath = buildIosXctraceExportCommand({
      xcrunPath: "/usr/bin/xcrun",
      inputTracePath: "/tmp/capture.trace",
      xpath: "/trace-toc/run/data/table"
    });
    expect(xpath.args).toContain("--xpath");
  });

  it("rejects unsafe newlines", () => {
    expect(() =>
      buildIosXctraceRecordCommand({
        xcrunPath: "/usr/bin/xcrun",
        udid: "simulator\nbad",
        outputTracePath: "/tmp/capture.trace"
      })
    ).toThrow(/safe xctrace argument/u);
  });
});
