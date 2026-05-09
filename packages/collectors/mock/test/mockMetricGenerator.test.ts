import { describe, expect, it } from "vitest";
import { METRIC_NAMES, type MetricEvent } from "@lumatrace/core";
import {
  createMockMetricEvents,
  createMockMetricGenerator,
  mockProfiles
} from "../src";

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

function numericMetric(events: readonly MetricEvent[], metricName: string): number {
  const event = events.find((candidate) => candidate.metricName === metricName);
  if (event === undefined || event.value === null) {
    throw new Error(`Metric ${metricName} not found.`);
  }

  return event.value;
}

describe("mock metric generator", () => {
  it("produces the same event sequence for the same seed, profile, and sample index", () => {
    const first = createMockMetricEvents({
      sessionId: "session-1",
      deviceId: "device-1",
      targetId: "target-1",
      profileName: "janky_game",
      seed: "stable-seed",
      sampleIndex: 12
    });
    const second = createMockMetricEvents({
      sessionId: "session-1",
      deviceId: "device-1",
      targetId: "target-1",
      profileName: "janky_game",
      seed: "stable-seed",
      sampleIndex: 12
    });

    expect(second).toEqual(first);
  });

  it("generates fps, frame time, cpu, and memory events", () => {
    const events = createMockMetricEvents({
      sessionId: "session-1",
      deviceId: "device-1",
      targetId: "target-1",
      profileName: "stable_60fps",
      seed: "metrics",
      sampleIndex: 1
    });

    expect(events.map((event) => event.metricName)).toEqual([
      METRIC_NAMES.FPS,
      METRIC_NAMES.FRAME_TIME_MS,
      METRIC_NAMES.CPU_PERCENT,
      METRIC_NAMES.MEMORY_MB
    ]);
  });

  it("makes the janky_game profile produce jank or severe jank", () => {
    const frameEvents = Array.from({ length: 30 }, (_unused, index) =>
      createMockMetricEvents({
        sessionId: "session-1",
        deviceId: "device-1",
        targetId: "target-1",
        profileName: "janky_game",
        seed: "jank-seed",
        sampleIndex: index
      }).find((event) => event.metricName === METRIC_NAMES.FRAME_TIME_MS)
    ).filter((event): event is MetricEvent => event !== undefined);

    expect(frameEvents.some((event) => event.tags?.jankType === "jank")).toBe(true);
    expect(frameEvents.some((event) => event.tags?.jankType === "severe_jank")).toBe(true);
  });

  it("makes the memory_growth profile trend upward overall", () => {
    const first = createMockMetricEvents({
      sessionId: "session-1",
      deviceId: "device-1",
      targetId: "target-1",
      profile: mockProfiles.memory_growth,
      seed: "memory-seed",
      sampleIndex: 0
    });
    const last = createMockMetricEvents({
      sessionId: "session-1",
      deviceId: "device-1",
      targetId: "target-1",
      profile: mockProfiles.memory_growth,
      seed: "memory-seed",
      sampleIndex: 40
    });

    expect(numericMetric(last, METRIC_NAMES.MEMORY_MB)).toBeGreaterThan(
      numericMetric(first, METRIC_NAMES.MEMORY_MB)
    );
  });

  it("adds source, precision, confidence, timestamp, and sequence to every event", () => {
    const events = createMockMetricEvents({
      sessionId: "session-1",
      deviceId: "device-1",
      targetId: "target-1",
      profileName: "stable_60fps",
      seed: "shape",
      sampleIndex: 3
    });

    for (const event of events) {
      expect(event.source).toBe("mock");
      expect(event.precision).toBeDefined();
      expect(event.confidence).toBeDefined();
      expect(event.timestampMs).toBeGreaterThanOrEqual(0);
      expect(event.sequence).toBeTypeOf("number");
      expect(event.tags?.profileName).toBe("stable_60fps");
      expect(event.tags?.refreshRate).toBe(60);
    }
  });

  it("can be collected quickly as an AsyncIterable", async () => {
    const events = await collectAsyncIterable(
      createMockMetricGenerator({
        sessionId: "session-1",
        deviceId: "device-1",
        targetId: "target-1",
        profileName: "stable_60fps",
        seed: "async-seed",
        immediate: true
      }),
      6
    );

    expect(events).toHaveLength(6);
    expect(events[0]?.sequence).toBe(0);
    expect(events[5]?.sequence).toBe(5);
  });
});
