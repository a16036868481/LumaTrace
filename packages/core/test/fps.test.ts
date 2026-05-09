import { describe, expect, it } from "vitest";
import {
  countJankFrames,
  countSevereJankFrames,
  expectedFrameTimeMs,
  frameTimeToFps,
  summarizeFps
} from "../src/stats/fps";

describe("fps stats", () => {
  it("converts frame time to fps", () => {
    expect(frameTimeToFps(16.6667)).toBeCloseTo(60, 1);
    expect(frameTimeToFps(0)).toBeUndefined();
  });

  it("counts jank and severe jank using refresh rate thresholds", () => {
    expect(expectedFrameTimeMs(60)).toBeCloseTo(16.6667, 3);
    expect(countJankFrames([16, 33, 34, 51], 60)).toBe(2);
    expect(countSevereJankFrames([16, 33, 34, 51], 60)).toBe(1);
  });

  it("summarizes fps and frame-time percentiles", () => {
    const summary = summarizeFps({
      frameTimesMs: [16, 16, 20, 34, 51],
      refreshRate: 60
    });

    expect(summary.sampleCount).toBe(5);
    expect(summary.avgFps).toBeCloseTo(44.8, 2);
    expect(summary.minFps).toBeCloseTo(19.6, 1);
    expect(summary.maxFps).toBeCloseTo(62.5, 1);
    expect(summary.onePercentLowFps).toBeCloseTo(19.6, 1);
    expect(summary.zeroPointOnePercentLowFps).toBeCloseTo(19.6, 1);
    expect(summary.p50FrameTimeMs).toBe(20);
    expect(summary.p95FrameTimeMs).toBeCloseTo(47.6, 1);
    expect(summary.jankCount).toBe(2);
    expect(summary.severeJankCount).toBe(1);
  });
});
