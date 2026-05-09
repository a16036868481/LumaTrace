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

describe("AndroidCollector sessions", () => {
  it("streams Android CPU, memory, and battery metrics for a running target", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);

    const session = await collector.startSession({
      id: "android-session-1",
      name: "Android 2B",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1
    });
    expect(session).toMatchObject({ status: "running", id: "android-session-1" });

    const events = await collectEvents(collector.streamMetrics(session.id), 8);
    expect(events.some((event) => event.metricName === "cpu_percent")).toBe(true);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(events.some((event) => event.metricName === "battery_level_percent")).toBe(true);
    expect(events.some((event) => event.metricName === "fps")).toBe(false);
    expect(events.some((event) => event.metricName === "network_rx_bytes")).toBe(false);
    expect(events.every((event) => event.source.length > 0)).toBe(true);
    expect(events.every((event) => event.precision !== undefined && event.confidence !== undefined)).toBe(true);
    await collector.stopSession(session.id);
  });

  it("pauses output and ends streams on stop", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "android-session-pause",
      name: "Android pause",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 20
    });
    const iterator = collector.streamMetrics(session.id)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await collector.pauseSession(session.id);
    const paused = await Promise.race([
      iterator.next().then(() => "event"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 5))
    ]);
    expect(paused).toBe("timeout");
    await collector.stopSession(session.id);
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it("returns a clear error when the target process is not running", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pid = null;
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);

    await expect(
      collector.startSession({
        id: "android-session-missing-pid",
        name: "Android missing pid",
        deviceId: device!.id,
        targetId: target!.id,
        sampleIntervalMs: 1
      })
    ).rejects.toThrow("Target process is not running");
  });

  it("rejects streaming after a session is stopped", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "android-session-stopped",
      name: "Android stopped",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1
    });
    await collector.stopSession(session.id);

    expect(() => collector.streamMetrics(session.id)).toThrow("Android session does not exist");
  });
});
