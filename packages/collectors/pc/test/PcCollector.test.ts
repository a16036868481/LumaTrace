import { describe, expect, it } from "vitest";
import { PcCollector, type WindowsProcessInfo } from "../src";
import { FakeProcessAdapter } from "./fakeProcessAdapter";
import { FakeHardwareTelemetryProvider } from "./fakeHardwareTelemetryProvider";

function processInfo(overrides: Partial<WindowsProcessInfo> = {}): WindowsProcessInfo {
  return {
    pid: 4321,
    name: "Game.exe",
    startTimeMs: 100,
    workingSetBytes: 104857600,
    privateBytes: 52428800,
    kernelTimeMs: 100,
    userTimeMs: 100,
    ...overrides
  };
}

async function collectUntil<T>(
  iterable: AsyncIterable<T>,
  predicate: (items: T[]) => boolean,
  timeoutMs = 1000
): Promise<T[]> {
  const output: T[] = [];
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  const task = (async () => {
    for await (const item of iterable) {
      output.push(item);
      if (predicate(output)) {
        break;
      }
    }
    return output;
  })();
  return Promise.race([task, timeout]);
}

describe("PcCollector", () => {
  it("discovers local PC, lists process targets, and streams CPU/memory without FPS", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.processes = [processInfo()];
    adapter.queue.set(4321, [
      processInfo(),
      processInfo(),
      processInfo({ kernelTimeMs: 200, userTimeMs: 300, workingSetBytes: 110100480 }),
      processInfo({ kernelTimeMs: 200, userTimeMs: 300, workingSetBytes: 110100480 }),
      processInfo({ kernelTimeMs: 300, userTimeMs: 600, workingSetBytes: 115343360 }),
      processInfo({ kernelTimeMs: 300, userTimeMs: 600, workingSetBytes: 115343360 })
    ]);
    const collector = new PcCollector({
      processAdapter: adapter,
      platform: "win32",
      processorCount: 4,
      hardwareTelemetryProvider: new FakeHardwareTelemetryProvider()
    });
    const [device] = await collector.discoverDevices();
    expect(device?.id).toBe("pc-local:windows");
    const [target] = await collector.listTargets(device!.id);
    expect(target?.pid).toBe(4321);
    const session = await collector.startSession({
      id: "pc-session",
      name: "PC Session",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1
    });
    const events = await collectUntil(
      collector.streamMetrics(session.id),
      (items) =>
        items.some((event) => event.metricName === "memory_mb") &&
        items.some((event) => event.metricName === "cpu_percent"),
      1500
    );
    await collector.stopSession(session.id);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(events.some((event) => event.metricName === "cpu_percent")).toBe(true);
    expect(events.some((event) => event.metricName === "fps")).toBe(false);
  });

  it("reports process exited cleanly and keeps PresentMon missing separate from CPU/memory", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.processes = [processInfo()];
    adapter.queue.set(4321, [processInfo(), null]);
    const collector = new PcCollector({
      processAdapter: adapter,
      platform: "win32",
      hardwareTelemetryProvider: new FakeHardwareTelemetryProvider()
    });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "pc-exit",
      name: "PC Exit",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1
    });
    await expect(async () => {
      for await (const event of collector.streamMetrics(session.id)) {
        void event;
        // No-op.
      }
    }).rejects.toThrow(/exited/i);
    expect(collector.listDiagnostics({ sessionId: session.id }).some((event) => event.code === "PROCESS_EXITED")).toBe(true);
    expect((await collector.getToolStatus()).toolName).toBe("PresentMon");
  });
});
