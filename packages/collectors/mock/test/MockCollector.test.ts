import { describe, expect, it } from "vitest";
import { CollectorError, METRIC_NAMES, type MetricEvent } from "@lumatrace/core";
import { MockCollector } from "../src";

async function collectAsyncIterable<T>(
  iterable: AsyncIterable<T>,
  count: number,
  timeoutMs = 500
): Promise<T[]> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T[]>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Timed out while collecting ${count} async items.`));
    }, timeoutMs);
  });
  const collect = (async (): Promise<T[]> => {
    const output: T[] = [];
    for await (const item of iterable) {
      output.push(item);
      if (output.length >= count) {
        break;
      }
    }

    return output;
  })();

  try {
    return await Promise.race([collect, timeout]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function createRunningSession(collector: MockCollector) {
  return collector.startSession({
    id: "test-session",
    name: "Test Session",
    deviceId: "mock-local-device-1",
    targetId: "mock-game",
    sampleIntervalMs: 1,
    options: {
      profileName: "janky_game",
      seed: "collector-seed",
      immediate: true
    }
  });
}

describe("MockCollector", () => {
  it("discovers the mock local device", async () => {
    const collector = new MockCollector();
    const devices = await collector.discoverDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]?.id).toBe("mock-local-device-1");
    expect(devices[0]?.name).toBe("Mock Local Device");
    expect(devices[0]?.connectionType).toBe("local");
    expect(devices[0]?.capabilities.every((capability) => capability.source === "mock")).toBe(true);
  });

  it("lists mock targets for the mock device", async () => {
    const collector = new MockCollector();
    const targets = await collector.listTargets("mock-local-device-1");

    expect(targets.map((target) => target.name)).toEqual(["Mock Game", "Mock App"]);
    expect(targets.map((target) => target.type)).toEqual(["game", "app"]);
  });

  it("returns mock capabilities", async () => {
    const collector = new MockCollector();
    const capabilities = await collector.getCapabilities("mock-local-device-1");

    expect(capabilities.map((capability) => capability.metricName)).toEqual([
      METRIC_NAMES.FPS,
      METRIC_NAMES.FRAME_TIME_MS,
      METRIC_NAMES.CPU_PERCENT,
      METRIC_NAMES.MEMORY_MB
    ]);
    expect(capabilities.every((capability) => capability.source === "mock")).toBe(true);
  });

  it("starts a running session", async () => {
    const collector = new MockCollector();
    const session = await createRunningSession(collector);

    expect(session.status).toBe("running");
    expect(session.startedAt).toBeTypeOf("number");
    expect(session.sampleIntervalMs).toBe(1);
  });

  it("streams metric events from a running session", async () => {
    const collector = new MockCollector();
    const session = await createRunningSession(collector);
    const events = await collectAsyncIterable(collector.streamMetrics(session.id), 8);

    expect(events).toHaveLength(8);
    expect(events.map((event) => event.metricName).slice(0, 4)).toEqual([
      METRIC_NAMES.FPS,
      METRIC_NAMES.FRAME_TIME_MS,
      METRIC_NAMES.CPU_PERCENT,
      METRIC_NAMES.MEMORY_MB
    ]);
    expect(events.every((event) => event.source === "mock")).toBe(true);
    expect(events.every((event) => event.precision !== undefined)).toBe(true);
    expect(events.every((event) => event.confidence !== undefined)).toBe(true);
  });

  it("pauses a running session", async () => {
    const collector = new MockCollector();
    const session = await createRunningSession(collector);

    await collector.pauseSession(session.id);

    expect(collector.getSessionSnapshot(session.id)?.status).toBe("paused");
  });

  it("ends an active stream after stopSession", async () => {
    const collector = new MockCollector();
    const session = await createRunningSession(collector);
    const iterator = collector.streamMetrics(session.id)[Symbol.asyncIterator]();
    const first = await iterator.next();

    expect(first.done).toBe(false);

    await collector.stopSession(session.id);

    const second = await Promise.race([
      iterator.next(),
      new Promise<IteratorResult<MetricEvent>>((_, reject) => {
        setTimeout(() => reject(new Error("Stream did not end after stop.")), 500);
      })
    ]);

    expect(second.done).toBe(true);
    expect(collector.getSessionSnapshot(session.id)?.status).toBe("stopped");
  });

  it("fails for unknown device, target, and session ids", async () => {
    const collector = new MockCollector();

    await expect(collector.listTargets("missing-device")).rejects.toBeInstanceOf(CollectorError);
    await expect(
      collector.startSession({
        name: "Bad Device",
        deviceId: "missing-device",
        targetId: "mock-game",
        sampleIntervalMs: 1
      })
    ).rejects.toBeInstanceOf(CollectorError);
    await expect(
      collector.startSession({
        name: "Bad Target",
        deviceId: "mock-local-device-1",
        targetId: "missing-target",
        sampleIntervalMs: 1
      })
    ).rejects.toBeInstanceOf(CollectorError);
    await expect(collector.pauseSession("missing-session")).rejects.toBeInstanceOf(CollectorError);
    expect(() => collector.streamMetrics("missing-session")).toThrow(CollectorError);
  });

  it("rejects duplicate start for an already running session", async () => {
    const collector = new MockCollector();
    await createRunningSession(collector);

    await expect(createRunningSession(collector)).rejects.toBeInstanceOf(CollectorError);
  });

  it("does not allow starting a new stream after the session is stopped", async () => {
    const collector = new MockCollector();
    const session = await createRunningSession(collector);

    await collector.stopSession(session.id);

    expect(() => collector.streamMetrics(session.id)).toThrow(CollectorError);
  });
});
