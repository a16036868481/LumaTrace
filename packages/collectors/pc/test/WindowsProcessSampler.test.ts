import { describe, expect, it } from "vitest";
import { WindowsProcessSampler } from "../src";
import { FakeProcessAdapter } from "./fakeProcessAdapter";

describe("WindowsProcessSampler", () => {
  it("combines CPU baseline behavior with memory samples", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.queue.set(4321, [
      { pid: 4321, name: "Game.exe", kernelTimeMs: 100, userTimeMs: 100, workingSetBytes: 104857600, startTimeMs: 1 },
      { pid: 4321, name: "Game.exe", kernelTimeMs: 100, userTimeMs: 100, workingSetBytes: 104857600, startTimeMs: 1 },
      { pid: 4321, name: "Game.exe", kernelTimeMs: 200, userTimeMs: 300, workingSetBytes: 110100480, startTimeMs: 1 },
      { pid: 4321, name: "Game.exe", kernelTimeMs: 200, userTimeMs: 300, workingSetBytes: 110100480, startTimeMs: 1 }
    ]);
    let now = 0;
    const sampler = new WindowsProcessSampler({
      adapter,
      sessionId: "s",
      deviceId: "d",
      targetId: "t",
      process: { pid: 4321, name: "Game.exe", startTimeMs: 1 },
      processorCount: 4,
      nowMs: () => {
        now += 1000;
        return now;
      }
    });
    const first = await sampler.sample();
    expect(first.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(first.some((event) => event.metricName === "cpu_percent")).toBe(false);
    const second = await sampler.sample();
    expect(second.some((event) => event.metricName === "cpu_percent")).toBe(true);
  });
});
