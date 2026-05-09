import { describe, expect, it } from "vitest";
import type { MetricEvent } from "@lumatrace/core";
import type { AndroidFpsProbeResult } from "../src/fps/AndroidFpsProbe";
import { AndroidCollector } from "../src/AndroidCollector";
import { FakeSamplingAdbClient } from "./fakeAdbClient";

function fpsResult(status: AndroidFpsProbeResult["status"], metricEvents?: MetricEvent[]): AndroidFpsProbeResult {
  return {
    status,
    warnings: status === "available" ? [] : ["fps probe did not produce target FPS"],
    availability: [
      {
        metricName: "fps",
        platform: "android",
        status: "experimental",
        reason: "test",
        suggestedAction: "test",
        source: "adb:dumpsys gfxinfo framestats"
      }
    ],
    ...(metricEvents === undefined ? {} : { metricEvents })
  };
}

async function createReadyCollector(options: { enableExperimentalFps?: boolean } = {}) {
  const adbClient = new FakeSamplingAdbClient();
  const calls = {
    factory: 0,
    prepare: 0,
    finish: 0
  };
  const collector = new AndroidCollector({
    adbClient,
    fpsProbeFactory: () => {
      calls.factory += 1;
      return {
        async prepare() {
          calls.prepare += 1;
          return fpsResult("available");
        },
        async finish() {
          calls.finish += 1;
          return fpsResult(options.enableExperimentalFps === false ? "failed" : "ambiguous");
        }
      };
    }
  });
  const devices = await collector.discoverDevices();
  const targets = await collector.listTargets(devices[0]!.id);
  return { collector, calls, devices, targets };
}

async function collectUntil<T>(
  iterable: AsyncIterable<T>,
  predicate: (events: T[]) => boolean,
  timeoutMs = 1000
): Promise<T[]> {
  const events: T[] = [];
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("Timed out collecting async iterable")), timeoutMs);
  });
  const task = (async () => {
    for await (const event of iterable) {
      events.push(event);
      if (predicate(events)) {
        break;
      }
    }
    return events;
  })();
  return Promise.race([task, timeout]);
}

describe("AndroidCollector FPS availability", () => {
  it("marks fps and frame_time_ms experimental", async () => {
    const { collector } = await createReadyCollector();

    await expect(collector.getCapabilities()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricName: "fps", status: "experimental" }),
        expect.objectContaining({ metricName: "frame_time_ms", status: "experimental" })
      ])
    );
  });

  it("does not call the FPS probe when enableExperimentalFps is false", async () => {
    const { collector, calls, devices, targets } = await createReadyCollector();
    await collector.startSession({
      id: "no-fps",
      name: "Android",
      deviceId: devices[0]!.id,
      targetId: targets[0]!.id,
      sampleIntervalMs: 100,
      options: {
        enableExperimentalFps: false
      }
    });
    await collector.stopSession("no-fps");

    expect(calls.factory).toBe(0);
    expect(calls.prepare).toBe(0);
    expect(calls.finish).toBe(0);
  });

  it("prepares and finishes the experimental FPS probe when explicitly enabled", async () => {
    const { collector, calls, devices, targets } = await createReadyCollector();
    await collector.startSession({
      id: "with-fps",
      name: "Android",
      deviceId: devices[0]!.id,
      targetId: targets[0]!.id,
      sampleIntervalMs: 100,
      options: {
        enableExperimentalFps: true
      }
    });
    await collector.stopSession("with-fps");

    expect(calls.factory).toBe(1);
    expect(calls.prepare).toBe(1);
    expect(calls.finish).toBe(1);
  });

  it("keeps FPS probe failure nonfatal and does not synthesize FPS events", async () => {
    const { collector, devices, targets } = await createReadyCollector({ enableExperimentalFps: false });
    await collector.startSession({
      id: "failed-fps",
      name: "Android",
      deviceId: devices[0]!.id,
      targetId: targets[0]!.id,
      sampleIntervalMs: 100,
      options: {
        enableExperimentalFps: true
      }
    });

    await expect(collector.stopSession("failed-fps")).resolves.toBeUndefined();
  });

  it("exposes real FPS probe metric events after stop for storage and reports", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const collector = new AndroidCollector({
      adbClient,
      fpsProbeFactory: () => ({
        async prepare() {
          return fpsResult("available");
        },
        async finish() {
          return fpsResult("available", [
            {
              sessionId: "final-fps",
              timestampMs: Date.now(),
              deviceId: "android:device",
              targetId: "android-package:com.example.app",
              metricName: "fps",
              value: 59.4,
              unit: "fps",
              source: "adb:dumpsys gfxinfo framestats",
              precision: "estimated",
              confidence: "medium",
              tags: {
                experimental: true
              }
            },
            {
              sessionId: "final-fps",
              timestampMs: Date.now(),
              deviceId: "android:device",
              targetId: "android-package:com.example.app",
              metricName: "frame_time_ms",
              value: 16.8,
              unit: "ms",
              source: "adb:dumpsys gfxinfo framestats",
              precision: "estimated",
              confidence: "medium",
              tags: {
                experimental: true
              }
            }
          ]);
        }
      })
    });
    const devices = await collector.discoverDevices();
    const targets = await collector.listTargets(devices[0]!.id);

    await collector.startSession({
      id: "final-fps",
      name: "Android",
      deviceId: devices[0]!.id,
      targetId: targets[0]!.id,
      sampleIntervalMs: 100,
      options: {
        enableExperimentalFps: true
      }
    });
    await collector.stopSession("final-fps");

    expect(collector.drainFinalMetrics("final-fps")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricName: "fps", value: 59.4 }),
        expect.objectContaining({ metricName: "frame_time_ms", value: 16.8 })
      ])
    );
    expect(collector.drainFinalMetrics("final-fps")).toEqual([]);
  });

  it("streams realtime experimental FPS probe events when enabled", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const collector = new AndroidCollector({
      adbClient,
      fpsProbeFactory: () => ({
        async prepare() {
          return fpsResult("available");
        },
        async finish() {
          return fpsResult("available", [
            {
              sessionId: "realtime-fps",
              timestampMs: Date.now(),
              deviceId: "android:device",
              targetId: "android-package:com.example.app",
              metricName: "fps",
              value: 58.5,
              unit: "fps",
              source: "adb:dumpsys gfxinfo framestats",
              precision: "estimated",
              confidence: "medium",
              tags: {
                experimental: true
              }
            },
            {
              sessionId: "realtime-fps",
              timestampMs: Date.now(),
              deviceId: "android:device",
              targetId: "android-package:com.example.app",
              metricName: "frame_time_ms",
              value: 17.1,
              unit: "ms",
              source: "adb:dumpsys gfxinfo framestats",
              precision: "estimated",
              confidence: "medium",
              tags: {
                experimental: true
              }
            }
          ]);
        }
      })
    });
    const devices = await collector.discoverDevices();
    const targets = await collector.listTargets(devices[0]!.id);
    const session = await collector.startSession({
      id: "realtime-fps",
      name: "Android",
      deviceId: devices[0]!.id,
      targetId: targets[0]!.id,
      sampleIntervalMs: 1,
      options: {
        enableExperimentalFps: true,
        enableRealtimeFps: true,
        fpsSampleIntervalMs: 1000
      }
    });

    const events = await collectUntil(
      collector.streamMetrics(session.id),
      (items) =>
        items.some((event) => event.metricName === "fps") &&
        items.some((event) => event.metricName === "frame_time_ms")
    );
    await collector.stopSession(session.id);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricName: "fps", value: 58.5 }),
        expect.objectContaining({ metricName: "frame_time_ms", value: 17.1 })
      ])
    );
  });
});
