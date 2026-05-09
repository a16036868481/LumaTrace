import { describe, expect, it } from "vitest";
import type { SurfaceLayerInfo } from "../src/parsers/parseSurfaceFlingerLayers";
import { matchLayer } from "../src/fps/LayerMatcher";

function layer(name: string, typeGuess: SurfaceLayerInfo["typeGuess"] = "app"): SurfaceLayerInfo {
  return { name, rawLine: name, typeGuess };
}

describe("LayerMatcher", () => {
  it("prefers exact and SurfaceView target package matches", () => {
    expect(matchLayer({ packageName: "com.example.app", layers: [layer("com.example.app")] })).toMatchObject({
      matchedLayerName: "com.example.app",
      confidence: "high",
      ambiguity: false
    });
    expect(
      matchLayer({ packageName: "com.example.app", layers: [layer("SurfaceView - com.example.app", "surfaceview")] })
    ).toMatchObject({
      matchedLayerName: "SurfaceView - com.example.app",
      confidence: "high"
    });
  });

  it("handles engine layers and excludes system layers", () => {
    const result = matchLayer({
      packageName: "com.example.game",
      layers: [
        layer("StatusBar", "system"),
        layer("UnitySurfaceView - com.example.game", "surfaceview")
      ]
    });

    expect(result.matchedLayerName).toBe("UnitySurfaceView - com.example.game");
    expect(result.confidence).toBe("medium");
    expect(result.candidates.map((candidate) => candidate.layerName)).not.toContain("StatusBar");
  });

  it("prefers renderable BLAST SurfaceView over helper layers", () => {
    const result = matchLayer({
      packageName: "com.tencent.lolm",
      layers: [
        layer("Background for SurfaceView - com.tencent.lolm/com.tencent.lolm.lgame@3f2c35d@3#0"),
        layer("SurfaceView - com.tencent.lolm/com.tencent.lolm.lgame@3f2c35d@3#0"),
        layer("SurfaceView - com.tencent.lolm/com.tencent.lolm.lgame@3f2c35d@3(BLAST)#0"),
        layer("Bounds for - com.tencent.lolm/com.tencent.lolm.lgame@3#0")
      ]
    });

    expect(result).toMatchObject({
      matchedLayerName: "SurfaceView - com.tencent.lolm/com.tencent.lolm.lgame@3f2c35d@3(BLAST)#0",
      confidence: "high",
      ambiguity: false
    });
    expect(result.candidates.map((candidate) => candidate.layerName)).not.toContain(
      "Background for SurfaceView - com.tencent.lolm/com.tencent.lolm.lgame@3f2c35d@3#0"
    );
  });

  it("supports emulator bracketed SurfaceView activity layers", () => {
    const result = matchLayer({
      packageName: "com.argojc.neonringrush",
      layers: [
        layer("ActivityRecord{1f2a17f u0 com.argojc.neonringrush/.MainActivity t11}#0"),
        layer("2bf7e0c com.argojc.neonringrush/com.argojc.neonringrush.MainActivity#0"),
        layer("Background for SurfaceView[com.argojc.neonringrush/com.argojc.neonringrush.MainActivity]#0"),
        layer("SurfaceView[com.argojc.neonringrush/com.argojc.neonringrush.MainActivity]#0"),
        layer("SurfaceView[com.argojc.neonringrush/com.argojc.neonringrush.MainActivity](BLAST)#0")
      ]
    });

    expect(result).toMatchObject({
      matchedLayerName: "SurfaceView[com.argojc.neonringrush/com.argojc.neonringrush.MainActivity](BLAST)#0",
      confidence: "high",
      ambiguity: false
    });
    expect(result.candidates.map((candidate) => candidate.layerName)).not.toContain(
      "ActivityRecord{1f2a17f u0 com.argojc.neonringrush/.MainActivity t11}#0"
    );
  });

  it("marks close candidates as ambiguous and does not match when there are no candidates", () => {
    expect(
      matchLayer({
        packageName: "com.example.app",
        layers: [layer("SurfaceView - com.example.app"), layer("SurfaceView[com.example.app]")]
      })
    ).toMatchObject({
      confidence: "low",
      ambiguity: true
    });
    expect(matchLayer({ packageName: "com.example.app", layers: [layer("NavigationBar", "system")] })).toMatchObject({
      confidence: "none",
      ambiguity: false
    });
  });
});
