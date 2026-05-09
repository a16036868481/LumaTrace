import { describe, expect, it } from "vitest";
import { AndroidMemorySampler } from "../src/sampling/AndroidMemorySampler";
import { parseMeminfo } from "../src/parsers/parseMeminfo";
import { FakeSamplingAdbClient } from "./fakeAdbClient";
import { readAndroidFixture } from "./fixture";
import { createSamplerContext } from "./samplerContext";

describe("AndroidMemorySampler", () => {
  it("emits memory_mb from dumpsys meminfo with Android breakdown tags", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const sampler = new AndroidMemorySampler({ adbClient, context: createSamplerContext() });

    const events = await sampler.sample();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      metricName: "memory_mb",
      source: "adb:dumpsys meminfo",
      precision: "estimated",
      confidence: "high"
    });
    expect(events[0]?.value).toBeGreaterThan(0);
    expect(events[0]?.tags).toMatchObject({
      totalPssMb: expect.any(Number),
      nativeHeapMb: expect.any(Number),
      dalvikHeapMb: expect.any(Number),
      sourceCommand: "dumpsys meminfo"
    });
  });

  it("falls back to /proc/<pid>/status with low confidence when meminfo is unavailable", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.meminfo = parseMeminfo(readAndroidFixture("dumpsys_meminfo_unavailable_sample.txt"));
    const sampler = new AndroidMemorySampler({ adbClient, context: createSamplerContext() });

    const events = await sampler.sample();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      metricName: "memory_mb",
      source: "adb:/proc/<pid>/status",
      confidence: "low"
    });
    expect(events[0]?.tags).toMatchObject({ fallback: true, rssMb: expect.any(Number) });
  });

  it("does not emit fake memory when both meminfo and fallback are unavailable", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.meminfo = parseMeminfo(readAndroidFixture("dumpsys_meminfo_unavailable_sample.txt"));
    adbClient.procStatus = null;
    const sampler = new AndroidMemorySampler({ adbClient, context: createSamplerContext() });

    await expect(sampler.sample()).resolves.toEqual([]);
  });
});
