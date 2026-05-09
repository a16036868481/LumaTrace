import { describe, expect, it } from "vitest";
import type { MetricEvent } from "@lumatrace/core";
import { MetricRingBuffer } from "../src/runtime/MetricRingBuffer";

function metric(sessionId: string, sequence: number): MetricEvent {
  return {
    sessionId,
    timestampMs: 1000 + sequence,
    sequence,
    deviceId: "device-1",
    targetId: "target-1",
    metricName: "fps",
    value: sequence,
    unit: "fps",
    source: "mock",
    precision: "estimated",
    confidence: "high"
  };
}

describe("MetricRingBuffer", () => {
  it("pushes and returns recent metrics by session", () => {
    const buffer = new MetricRingBuffer(3);
    buffer.push(metric("a", 1));
    buffer.push(metric("a", 2));
    buffer.push(metric("b", 3));

    expect(buffer.getRecent("a")).toHaveLength(2);
    expect(buffer.getRecent("b")).toHaveLength(1);
    expect(buffer.getRecent("a", 1)[0]?.sequence).toBe(2);
  });

  it("evicts old metrics after max size", () => {
    const buffer = new MetricRingBuffer(2);
    buffer.push(metric("a", 1));
    buffer.push(metric("a", 2));
    buffer.push(metric("a", 3));

    expect(buffer.getAll("a").map((event) => event.sequence)).toEqual([2, 3]);
  });

  it("clears and reports size", () => {
    const buffer = new MetricRingBuffer(5);
    buffer.push(metric("a", 1));
    buffer.push(metric("b", 2));

    expect(buffer.size()).toBe(2);
    expect(buffer.size("a")).toBe(1);
    buffer.clear("a");
    expect(buffer.size()).toBe(1);
    expect(buffer.size("a")).toBe(0);
  });
});
