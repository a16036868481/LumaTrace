import { describe, expect, it } from "vitest";
import { WindowsMemorySampler, type WindowsProcessInfo } from "../src";
import { FakeProcessAdapter } from "./fakeProcessAdapter";

describe("WindowsMemorySampler", () => {
  it("emits memory_mb from working set with breakdown tags", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.processes = [
      {
        pid: 4321,
        name: "Game.exe",
        workingSetBytes: 104857600,
        privateBytes: 52428800
      } satisfies WindowsProcessInfo
    ];
    const sampler = new WindowsMemorySampler({
      adapter,
      sessionId: "s",
      deviceId: "d",
      targetId: "t",
      pid: 4321,
      processName: "Game.exe",
      nowMs: () => 1,
      nextSequence: () => 1
    });
    const events = await sampler.sample();
    expect(events[0]?.value).toBe(100);
    expect(events[0]?.tags?.privateBytesMb).toBe(50);
  });

  it("does not emit fake memory for missing fields or exited process", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.processes = [{ pid: 1, name: "NoMem.exe" }];
    const sampler = new WindowsMemorySampler({
      adapter,
      sessionId: "s",
      deviceId: "d",
      targetId: "t",
      pid: 1,
      processName: "NoMem.exe"
    });
    expect(await sampler.sample()).toHaveLength(0);
    adapter.processes = [];
    expect(await sampler.sample()).toHaveLength(0);
  });
});
