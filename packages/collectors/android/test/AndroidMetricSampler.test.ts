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
    throw new Error("sampler failed");
  }
}

describe("AndroidMetricSampler", () => {
  it("combines CPU, memory, and battery samplers with complete MetricEvent fields", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const sampler = new AndroidMetricSampler({ adbClient, context: createSamplerContext() });

    const first = await sampler.sample();
    const second = await sampler.sample();
    const events = [...first, ...second];

    expect(events.some((event) => event.metricName === "cpu_percent")).toBe(true);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(events.some((event) => event.metricName === "battery_level_percent")).toBe(true);
    expect(events.every((event) => event.source.length > 0)).toBe(true);
    expect(events.every((event) => event.precision !== undefined && event.confidence !== undefined)).toBe(true);
    expect(events.every((event) => event.sequence !== undefined && event.timestampMs > 0)).toBe(true);
  });

  it("keeps other sampler results when one sampler fails", async () => {
    const context = createSamplerContext();
    const event = createAndroidMetricEvent({
      context,
      metricName: "memory_mb",
      value: 128,
      unit: "MB",
      source: "adb:test",
      precision: "estimated",
      confidence: "medium"
    });
    const sampler = new AndroidMetricSampler({
      adbClient: new FakeSamplingAdbClient(),
      context,
      samplers: [new FailingSampler(), new StaticSampler(event)]
    });

    await expect(sampler.sample()).resolves.toEqual([event]);
    expect(sampler.consumeErrors()).toEqual([
      expect.objectContaining({ sampler: "FailingSampler", message: "sampler failed" })
    ]);
  });
});
