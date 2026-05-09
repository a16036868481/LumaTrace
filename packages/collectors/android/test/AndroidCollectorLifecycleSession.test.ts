import { describe, expect, it } from "vitest";
import { AndroidCollector } from "../src/AndroidCollector";
import { FakeSamplingAdbClient } from "./fakeAdbClient";

async function collectEvents<T>(iterable: AsyncIterable<T>, count: number, timeoutMs = 500): Promise<T[]> {
  const events: T[] = [];
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("Timed out collecting async iterable")), timeoutMs);
  });
  const collect = (async () => {
    for await (const event of iterable) {
      events.push(event);
      if (events.length >= count) {
        break;
      }
    }
    return events;
  })();
  return Promise.race([collect, timeout]);
}

describe("AndroidCollector lifecycle sessions", () => {
  it("requires explicit autoStartTarget when PID is missing", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pid = null;
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);

    await expect(
      collector.startSession({
        id: "missing-auto-start-off",
        name: "Missing process",
        deviceId: device!.id,
        targetId: target!.id,
        sampleIntervalMs: 1
      })
    ).rejects.toThrow("Enable autoStartTarget");
  });

  it("auto-starts the target when explicitly configured", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pid = null;
    adbClient.pidQueue = [null, 12345, 12345, 12345, 12345, 12345];
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);

    const session = await collector.startSession({
      id: "auto-start-on",
      name: "Auto start",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: {
        autoStartTarget: true,
        allowMonkeyFallback: false
      }
    });

    expect(session.config).toMatchObject({ autoStartTarget: true, allowMonkeyFallback: false });
    expect(adbClient.startActivityCalls).toEqual(["com.example.app/.MainActivity"]);
    const events = await collectEvents(collector.streamMetrics(session.id), 4);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    await collector.stopSession(session.id);
  });

  it("does not force-stop on session stop unless configured", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "no-force-stop",
      name: "No force stop",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1
    });

    await collector.stopSession(session.id);

    expect(adbClient.forceStopCalls).toEqual([]);
  });

  it("force-stops on session stop when explicitly configured", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "force-stop-on",
      name: "Force stop",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: {
        stopTargetOnSessionStop: true
      }
    });

    await collector.stopSession(session.id);

    expect(adbClient.forceStopCalls).toEqual(["com.example.app"]);
  });

  it("marks device metrics with processMissing and avoids fake CPU/memory", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pidQueue = [12345, null, null, 23456, 23456, 23456];
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "process-missing",
      name: "Missing process",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: {
        processMissingPolicy: "pause_process_metrics_keep_device_metrics"
      }
    });

    const events = await collectEvents(collector.streamMetrics(session.id), 8);
    const missingEvents = events.filter((event) => event.tags?.processMissing === true);
    expect(missingEvents.length).toBeGreaterThan(0);
    expect(missingEvents.some((event) => event.metricName === "cpu_percent")).toBe(false);
    expect(missingEvents.some((event) => event.metricName === "memory_mb")).toBe(false);
    expect(events.every((event) => event.value !== 0 || event.metricName !== "cpu_percent")).toBe(true);
    await collector.stopSession(session.id);
  });
});
