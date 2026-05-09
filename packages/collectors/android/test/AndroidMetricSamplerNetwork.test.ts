import { describe, expect, it } from "vitest";
import type { MetricEvent } from "@lumatrace/core";
import { AndroidMetricSampler, type AndroidSampler } from "../src/sampling/AndroidMetricSampler";
import { createAndroidMetricEvent } from "../src/sampling/AndroidSamplerTypes";
import { FakeSamplingAdbClient } from "./fakeAdbClient";
import { createSamplerContext } from "./samplerContext";

class StaticSampler implements AndroidSampler {
  constructor(private readonly event: MetricEvent) {}

  async sample(): Promise<MetricEvent[]> {
    return [this.event];
  }
}

class FailingSampler implements AndroidSampler {
  async sample(): Promise<MetricEvent[]> {
    throw new Error("network failed");
  }
}

describe("AndroidMetricSampler network integration", () => {
  it("combines CPU, memory, battery, and network events", async () => {
    const sampler = new AndroidMetricSampler({
      adbClient: new FakeSamplingAdbClient(),
      context: createSamplerContext({ sampleIntervalMs: 1000 })
    });

    await sampler.sample();
    const events = await sampler.sample();

    expect(events.some((event) => event.metricName === "cpu_percent")).toBe(true);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(events.some((event) => event.metricName === "battery_level_percent")).toBe(true);
    expect(events.some((event) => event.metricName === "network_rx_bytes")).toBe(true);
    expect(events.every((event) => event.source.length > 0)).toBe(true);
    expect(events.every((event) => event.precision !== undefined && event.confidence !== undefined)).toBe(true);
  });

  it("keeps other sampler results when network sampler fails", async () => {
    const context = createSamplerContext();
    const cpuEvent = createAndroidMetricEvent({
      context,
      metricName: "cpu_percent",
      value: 12,
      unit: "%",
      source: "adb:test",
      precision: "estimated",
      confidence: "medium"
    });
    const sampler = new AndroidMetricSampler({
      adbClient: new FakeSamplingAdbClient(),
      context,
      samplers: [new StaticSampler(cpuEvent), new FailingSampler()]
    });

    await expect(sampler.sample()).resolves.toEqual([cpuEvent]);
    expect(sampler.consumeErrors()).toEqual([
      expect.objectContaining({ sampler: "FailingSampler", message: "network failed" })
    ]);
  });
});
