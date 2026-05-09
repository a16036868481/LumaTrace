import { describe, expect, it } from "vitest";
import { AndroidFpsProbe } from "../src/fps/AndroidFpsProbe";
import { FakeSamplingAdbClient } from "./fakeAdbClient";
import { readAndroidFixture } from "./fixture";

function createProbe(adbClient = new FakeSamplingAdbClient()) {
  return new AndroidFpsProbe({
    adbClient,
    targetName: "Example App",
    context: {
      sessionId: "android-session",
      deviceId: "android:device",
      targetId: "android-package:com.example.app",
      serial: "R58M123ABC",
      pid: 12345,
      packageName: "com.example.app",
      sampleIntervalMs: 100,
      nowMs: () => 10_000,
      monotonicMs: () => 500,
      nextSequence: () => 1,
      processName: "com.example.app"
    }
  });
}

describe("AndroidFpsProbe", () => {
  it("prepares gfxinfo and SurfaceFlinger timestats without throwing", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const result = await createProbe(adbClient).prepare();

    expect(result.status).toBe("available");
    expect(adbClient.clearGfxinfoFramestatsCalls).toBe(1);
    expect(adbClient.clearSurfaceFlingerTimestatsCalls).toBe(1);
    expect(adbClient.enableSurfaceFlingerTimestatsCalls).toBe(1);
  });

  it("finishes with experimental metric events when frame timings are available", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const result = await createProbe(adbClient).finish();

    expect(result.status).toBe("available");
    expect(result.metricEvents?.some((event) => event.metricName === "fps")).toBe(true);
    expect(result.metricEvents?.some((event) => event.metricName === "frame_time_ms")).toBe(true);
    expect(result.metricEvents?.every((event) => event.tags?.experimental === true)).toBe(true);
    expect(adbClient.disableSurfaceFlingerTimestatsCalls).toBe(1);
  });

  it("does not output FPS when layer matching has no target layer", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.gfxinfoFramestats = readAndroidFixture("gfxinfo_framestats_empty_sample.txt");
    adbClient.surfaceFlingerTimestats = readAndroidFixture("surfaceflinger_timestats_no_target_layer_sample.txt");
    adbClient.surfaceFlingerLayers = "StatusBar\nNavigationBar\n";

    const result = await createProbe(adbClient).finish();

    expect(result.status).toBe("unavailable");
    expect(result.metricEvents).toBeUndefined();
    expect(result.layerMatchConfidence).toBe("none");
  });

  it("does not output stable FPS when layer matching is ambiguous", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.gfxinfoFramestats = readAndroidFixture("gfxinfo_framestats_empty_sample.txt");
    adbClient.surfaceFlingerTimestats = readAndroidFixture("surfaceflinger_timestats_multi_layer_sample.txt");
    adbClient.surfaceFlingerLayers = readAndroidFixture("surfaceflinger_layers_sample.txt");

    const result = await createProbe(adbClient).finish();

    expect(result.status).toBe("ambiguous");
    expect(result.metricEvents).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("Multiple SurfaceFlinger layer candidates");
  });

  it("falls back to SurfaceFlinger when gfxinfo has no frame timings", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.gfxinfoFramestats = readAndroidFixture("gfxinfo_framestats_empty_sample.txt");
    adbClient.surfaceFlingerTimestats = readAndroidFixture("surfaceflinger_timestats_sample.txt");
    adbClient.surfaceFlingerLayers = "com.example.app\n";
    adbClient.surfaceFlingerLatency = readAndroidFixture("surfaceflinger_latency_empty_sample.txt");

    const result = await createProbe(adbClient).finish();

    expect(result.status).toBe("available");
    expect(result.sourceUsed).toBe("surfaceflinger_timestats");
    expect(result.metricEvents?.some((event) => event.metricName === "fps")).toBe(true);
  });

  it("uses SurfaceFlinger latency for target-matched realtime frame times", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.gfxinfoFramestats = readAndroidFixture("gfxinfo_framestats_empty_sample.txt");
    adbClient.surfaceFlingerTimestats = readAndroidFixture("surfaceflinger_timestats_no_target_layer_sample.txt");
    adbClient.surfaceFlingerLayers = "SurfaceView - com.example.app/com.example.app.MainActivity@abc@1(BLAST)#0\n";
    adbClient.surfaceFlingerLatency = readAndroidFixture("surfaceflinger_latency_sample.txt");

    const result = await createProbe(adbClient).finish();

    expect(result.status).toBe("available");
    expect(result.sourceUsed).toBe("surfaceflinger_latency");
    expect(result.metricEvents?.some((event) => event.metricName === "frame_time_ms")).toBe(true);
    expect(result.metricEvents?.find((event) => event.metricName === "fps")?.source).toBe(
      "adb:dumpsys SurfaceFlinger --latency"
    );
  });

  it("keeps probe command failures contained", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.failMethods.add("clearGfxinfoFramestats");
    adbClient.failMethods.add("enableSurfaceFlingerTimestats");
    await expect(createProbe(adbClient).prepare()).resolves.toMatchObject({ status: "failed" });

    adbClient.failMethods.add("readGfxinfoFramestats");
    adbClient.failMethods.add("dumpSurfaceFlingerTimestats");
    await expect(createProbe(adbClient).finish()).resolves.toMatchObject({ status: "unavailable" });
  });
});
