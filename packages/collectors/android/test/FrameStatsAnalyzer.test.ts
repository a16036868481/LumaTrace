import { describe, expect, it } from "vitest";
import { analyzeFrameStats } from "../src/fps/FrameStatsAnalyzer";

describe("FrameStatsAnalyzer", () => {
  it("summarizes real frame-time samples with jank counts", () => {
    const analysis = analyzeFrameStats({
      frameTimeMsSamples: [16.6, 16.7, 33.4, 55],
      refreshRate: 60,
      source: "adb:dumpsys gfxinfo framestats",
      precision: "estimated"
    });

    expect(analysis.approximate).toBe(false);
    expect(analysis.avgFps).toBeGreaterThan(20);
    expect(analysis.p95FrameTimeMs).toBeGreaterThan(30);
    expect(analysis.jankCount).toBeGreaterThan(0);
    expect(analysis.severeJankCount).toBeGreaterThan(0);
  });

  it("marks histogram analysis approximate", () => {
    const analysis = analyzeFrameStats({
      histogram: [
        { bucketMs: 16, count: 20 },
        { bucketMs: 33, count: 2 }
      ],
      avgFps: 58,
      refreshRate: 60,
      source: "adb:dumpsys SurfaceFlinger --timestats",
      precision: "estimated"
    });

    expect(analysis.approximate).toBe(true);
    expect(analysis.avgFps).toBe(58);
    expect(analysis.frameTimeMsSamples).toBeDefined();
    expect(analysis.warnings.join(" ")).toContain("approximate");
  });

  it("does not infer frame-time percentiles from average FPS only", () => {
    const analysis = analyzeFrameStats({
      avgFps: 59.5,
      source: "adb:dumpsys SurfaceFlinger --timestats",
      precision: "estimated"
    });

    expect(analysis.avgFps).toBe(59.5);
    expect(analysis.p95FrameTimeMs).toBeUndefined();
    expect(analysis.frameTimeMsSamples).toBeUndefined();
    expect(analysis.warnings.join(" ")).toContain("60 Hz fallback");
  });

  it("keeps missing values undefined instead of returning zero", () => {
    const analysis = analyzeFrameStats({
      source: "adb:dumpsys SurfaceFlinger --timestats",
      precision: "estimated"
    });

    expect(analysis.avgFps).toBeUndefined();
    expect(analysis.p99FrameTimeMs).toBeUndefined();
  });
});
