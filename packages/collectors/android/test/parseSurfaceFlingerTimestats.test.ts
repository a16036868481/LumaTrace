import { describe, expect, it } from "vitest";
import { parseSurfaceFlingerTimestats } from "../src/parsers/parseSurfaceFlingerTimestats";
import { readAndroidFixture } from "./fixture";

describe("parseSurfaceFlingerTimestats", () => {
  it("parses average FPS, total frames, and histogram buckets", () => {
    const parsed = parseSurfaceFlingerTimestats(readAndroidFixture("surfaceflinger_timestats_sample.txt"));

    expect(parsed.layers).toHaveLength(1);
    expect(parsed.layers[0]).toMatchObject({
      layerName: "com.example.app",
      averageFps: 58.5,
      totalFrames: 120
    });
    expect(parsed.layers[0]?.presentToPresentHistogram).toEqual([
      { bucketMs: 16, count: 100 },
      { bucketMs: 33, count: 10 },
      { bucketMs: 50, count: 2 }
    ]);
    expect(parsed.layers[0]?.frameTimeMsSamplesApprox?.length).toBeGreaterThan(100);
  });

  it("parses multiple layers and leaves target filtering to layer matching", () => {
    const parsed = parseSurfaceFlingerTimestats(
      readAndroidFixture("surfaceflinger_timestats_multi_layer_sample.txt")
    );

    expect(parsed.layers.map((layer) => layer.layerName)).toEqual([
      "StatusBar",
      "SurfaceView - com.example.app",
      "SurfaceView - com.example.game"
    ]);
  });

  it("returns warnings for malformed or empty output without throwing", () => {
    expect(parseSurfaceFlingerTimestats(readAndroidFixture("surfaceflinger_timestats_malformed_sample.txt")).warnings).not.toHaveLength(0);
    expect(parseSurfaceFlingerTimestats("").warnings).toContain("SurfaceFlinger timestats output was empty.");
  });
});
