import { describe, expect, it } from "vitest";
import { calculateWindowsCpuPercent, WindowsCpuSampler, type WindowsProcessInfo } from "../src";
import { FakeProcessAdapter } from "./fakeProcessAdapter";

function proc(overrides: Partial<WindowsProcessInfo>): WindowsProcessInfo {
  return {
    pid: 4321,
    name: "Game.exe",
    kernelTimeMs: 1000,
    userTimeMs: 3000,
    startTimeMs: 1,
    ...overrides
  };
}

describe("WindowsCpuSampler", () => {
  it("uses first sample as baseline and emits second CPU metric", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.queue.set(4321, [proc({}), proc({ kernelTimeMs: 1100, userTimeMs: 3400 })]);
    let now = 1000;
    const sampler = new WindowsCpuSampler({
      adapter,
      sessionId: "s",
      deviceId: "pc-local:windows",
      targetId: "t",
      pid: 4321,
      processName: "Game.exe",
      processorCount: 4,
      nowMs: () => {
        now += 1000;
        return now;
      },
      nextSequence: () => 1
    });
    expect(await sampler.sample()).toHaveLength(0);
    const events = await sampler.sample();
    expect(events[0]?.metricName).toBe("cpu_percent");
    expect(events[0]?.value).toBeCloseTo(12.5);
    expect(events[0]?.tags?.rawPercent).toBe(50);
  });

  it("returns null for zero wall, negative deltas, and PID identity changes", () => {
    const prev = {
      pid: 1,
      processName: "a",
      timestampMs: 1,
      processKernelTimeMs: 10,
      processUserTimeMs: 10,
      processorCount: 2,
      processStartTimeMs: 1
    };
    expect(calculateWindowsCpuPercent(prev, { ...prev })).toBeNull();
    expect(calculateWindowsCpuPercent(prev, { ...prev, timestampMs: 2, processKernelTimeMs: 1 })).toBeNull();
    expect(calculateWindowsCpuPercent(prev, { ...prev, timestampMs: 2, processStartTimeMs: 2 })).toBeNull();
  });
});
