import { describe, expect, it } from "vitest";
import { parseSurfaceFlingerLatency } from "../src/parsers/parseSurfaceFlingerLatency";
import { readAndroidFixture } from "./fixture";

describe("parseSurfaceFlingerLatency", () => {
  it("parses refresh period and frame-time deltas", () => {
    const result = parseSurfaceFlingerLatency(readAndroidFixture("surfaceflinger_latency_sample.txt"));

    expect(result.refreshPeriodNs).toBe(16666666);
    expect(result.frames).toHaveLength(9);
    expect(result.frameTimeMsSamples).toHaveLength(8);
    expect(result.frameTimeMsSamples[0]).toBeCloseTo(16.705729, 3);
  });

  it("ignores zero rows without fabricating frame time", () => {
    const result = parseSurfaceFlingerLatency(readAndroidFixture("surfaceflinger_latency_empty_sample.txt"));

    expect(result.frames).toHaveLength(0);
    expect(result.frameTimeMsSamples).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("No usable SurfaceFlinger latency frames");
  });

  it("keeps malformed rows as warnings", () => {
    const result = parseSurfaceFlingerLatency("16666666\nbad row\n1 2 3\n");

    expect(result.frames).toHaveLength(1);
    expect(result.frameTimeMsSamples).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("Malformed SurfaceFlinger latency row");
  });
});
