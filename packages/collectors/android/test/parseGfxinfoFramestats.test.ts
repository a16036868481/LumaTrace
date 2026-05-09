import { describe, expect, it } from "vitest";
import { parseGfxinfoFramestats } from "../src/parsers/parseGfxinfoFramestats";
import { readAndroidFixture } from "./fixture";

describe("parseGfxinfoFramestats", () => {
  it("parses modern framestats and frameCompleted deltas", () => {
    const parsed = parseGfxinfoFramestats(readAndroidFixture("gfxinfo_framestats_sample.txt"), {
      packageName: "com.example.app",
      refreshRate: 60
    });

    expect(parsed.packageName).toBe("com.example.app");
    expect(parsed.frames).toHaveLength(4);
    expect(parsed.frameTimeMsSamples).toEqual([16.666667, 33.333333, 55]);
    expect(parsed.avgFps).toBeGreaterThan(25);
    expect(parsed.droppedFrameCount).toBe(1);
    expect(parsed.jankCount).toBeGreaterThan(0);
    expect(parsed.severeJankCount).toBeGreaterThan(0);
  });

  it("returns warnings for empty, malformed, and no-process output", () => {
    expect(parseGfxinfoFramestats(readAndroidFixture("gfxinfo_framestats_empty_sample.txt")).warnings).not.toHaveLength(0);
    expect(parseGfxinfoFramestats(readAndroidFixture("gfxinfo_framestats_malformed_sample.txt")).warnings).not.toHaveLength(0);
    expect(parseGfxinfoFramestats("No process found for: com.example.app").frames).toHaveLength(0);
  });

  it("does not fabricate frame times when no usable timestamps exist", () => {
    const parsed = parseGfxinfoFramestats(readAndroidFixture("gfxinfo_framestats_legacy_sample.txt"));

    expect(parsed.frameTimeMsSamples).toEqual([]);
    expect(parsed.avgFps).toBeUndefined();
  });
});
