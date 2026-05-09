import { describe, expect, it } from "vitest";
import { AndroidCpuSampler } from "../src/sampling/AndroidCpuSampler";
import { FakeSamplingAdbClient } from "./fakeAdbClient";
import { createSamplerContext } from "./samplerContext";

describe("AndroidCpuSampler", () => {
  it("uses the first sample as baseline and emits cpu_percent on the second sample", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const sampler = new AndroidCpuSampler({ adbClient, context: createSamplerContext() });

    await expect(sampler.sample()).resolves.toEqual([]);
    const events = await sampler.sample();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      metricName: "cpu_percent",
      unit: "%",
      source: "adb:/proc/stat+/proc/<pid>/stat",
      precision: "estimated",
      confidence: "medium"
    });
    expect(events[0]?.value).toBeCloseTo(12.2, 1);
    expect(events[0]?.tags).toMatchObject({
      rawPercent: expect.any(Number),
      normalizedPercent: expect.any(Number),
      coreCount: 2,
      sampler: "proc"
    });
  });

  it("does not emit fake CPU metrics when counters cannot be read", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.procStatQueue = [null];
    const sampler = new AndroidCpuSampler({ adbClient, context: createSamplerContext() });

    await expect(sampler.sample()).rejects.toThrow("CPU counters");
  });
});
