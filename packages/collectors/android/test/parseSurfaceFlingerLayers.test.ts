import { describe, expect, it } from "vitest";
import { parseSurfaceFlingerLayers } from "../src/parsers/parseSurfaceFlingerLayers";
import { readAndroidFixture } from "./fixture";

describe("parseSurfaceFlingerLayers", () => {
  it("parses app, SurfaceView, and system layers", () => {
    const parsed = parseSurfaceFlingerLayers(readAndroidFixture("surfaceflinger_layers_sample.txt"));

    expect(parsed.layers.map((layer) => layer.name)).toContain("com.example.app");
    expect(parsed.layers.find((layer) => layer.name === "SurfaceView - com.example.app")).toMatchObject({
      typeGuess: "surfaceview",
      packageNameGuess: "com.example.app"
    });
    expect(parsed.layers.find((layer) => layer.name === "StatusBar")).toMatchObject({
      typeGuess: "system"
    });
  });

  it("recognizes common engine layer names", () => {
    expect(parseSurfaceFlingerLayers(readAndroidFixture("surfaceflinger_layers_unity_sample.txt")).layers[0]).toMatchObject({
      typeGuess: "surfaceview",
      packageNameGuess: "com.example.game"
    });
    expect(parseSurfaceFlingerLayers(readAndroidFixture("surfaceflinger_layers_flutter_sample.txt")).layers[0]).toMatchObject({
      typeGuess: "app",
      packageNameGuess: "com.example.flutter"
    });
  });

  it("keeps malformed lines as warnings instead of throwing", () => {
    const parsed = parseSurfaceFlingerLayers("Layer\n----\n");

    expect(parsed.layers).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
