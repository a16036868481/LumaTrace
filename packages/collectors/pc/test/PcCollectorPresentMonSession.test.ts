import { describe, expect, it } from "vitest";
import { PcCollector, type PresentMonCaptureResult, type WindowsProcessInfo } from "../src";
import { FakeProcessAdapter } from "./fakeProcessAdapter";

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

async function collect<T>(iterable: AsyncIterable<T>, count: number, timeoutMs = 1000): Promise<T[]> {
  const output: T[] = [];
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  const task = (async () => {
    for await (const item of iterable) {
      output.push(item);
      if (output.length >= count) {
        break;
      }
    }
    return output;
  })();
  return Promise.race([task, timeout]);
}

function captureResult(metrics: PresentMonCaptureResult["metrics"]): PresentMonCaptureResult {
  return {
    status: "success",
    rawRowCount: metrics.length,
    matchedRowCount: metrics.length,
    metrics,
    diagnostics: [],
    warnings: [],
    durationMs: 10,
    source: "PresentMon"
  };
}

describe("PcCollector PresentMon session", () => {
  it("does not start capture when enablePresentMonCapture is false", async () => {
    let captureCalls = 0;
    const adapter = new FakeProcessAdapter();
    adapter.processes = [processInfo()];
    const collector = new PcCollector({
      processAdapter: adapter,
      platform: "win32",
      presentMonRuntimeFactory: () => ({
        async capture() {
          captureCalls += 1;
          return captureResult([]);
        },
        async abort() {
          // No-op.
        }
      })
    });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    await collector.startSession({
      id: "pc-no-capture",
      name: "PC",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: { enablePresentMonCapture: false }
    });
    expect(captureCalls).toBe(0);
  });

  it("streams CPU/memory and later PresentMon FPS/frame-time metrics", async () => {
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
      presentMonRuntimeFactory: () => ({
        async capture() {
          return captureResult([
            {
              sessionId: "pc-presentmon",
              timestampMs: 10,
              monotonicMs: 10,
              sequence: 0,
              deviceId: "pc-local:windows",
              targetId: "target",
              metricName: "fps",
              value: 60,
              unit: "fps",
              source: "PresentMon:CSV",
              precision: "estimated",
              confidence: "high",
              tags: { platform: "windows", experimental: true }
            },
            {
              sessionId: "pc-presentmon",
              timestampMs: 10,
              monotonicMs: 10,
              sequence: 1,
              deviceId: "pc-local:windows",
              targetId: "target",
              metricName: "frame_time_ms",
              value: 16.67,
              unit: "ms",
              source: "PresentMon:CSV",
              precision: "estimated",
              confidence: "high",
              tags: { platform: "windows", experimental: true }
            }
          ]);
        },
        async abort() {
          // No-op.
        }
      })
    });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "pc-presentmon",
      name: "PC",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: { enablePresentMonCapture: true, presentMonCaptureDurationMs: 1000 }
    });
    const events = await collect(collector.streamMetrics(session.id), 4);
    await collector.stopSession(session.id);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(events.some((event) => event.metricName === "fps")).toBe(true);
    expect(events.some((event) => event.metricName === "frame_time_ms")).toBe(true);
  });

  it("keeps CPU/memory running when capture returns no data", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.processes = [processInfo()];
    adapter.queue.set(4321, [
      processInfo(),
      processInfo(),
      processInfo({ kernelTimeMs: 200, userTimeMs: 300, workingSetBytes: 110100480 }),
      processInfo({ kernelTimeMs: 200, userTimeMs: 300, workingSetBytes: 110100480 })
    ]);
    const collector = new PcCollector({
      processAdapter: adapter,
      platform: "win32",
      presentMonRuntimeFactory: () => ({
        async capture() {
          return captureResult([]);
        },
        async abort() {
          // No-op.
        }
      })
    });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "pc-no-data",
      name: "PC",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: { enablePresentMonCapture: true }
    });
    const events = await collect(collector.streamMetrics(session.id), 2);
    await collector.stopSession(session.id);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(events.some((event) => event.metricName === "fps")).toBe(false);
  });

  it("streams PresentMon realtime FPS/frame-time from repeated capture chunks", async () => {
    let captureCalls = 0;
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
      presentMonRuntimeFactory: () => ({
        async capture() {
          captureCalls += 1;
          return captureResult([
            {
              sessionId: "pc-realtime-presentmon",
              timestampMs: 1000 + captureCalls,
              monotonicMs: 1000 + captureCalls,
              sequence: captureCalls,
              deviceId: "pc-local:windows",
              targetId: "target",
              metricName: "fps",
              value: 58 + captureCalls,
              unit: "fps",
              source: "PresentMon:CSV",
              precision: "estimated",
              confidence: "high",
              tags: { platform: "windows", experimental: true, realtime: true }
            },
            {
              sessionId: "pc-realtime-presentmon",
              timestampMs: 1000 + captureCalls,
              monotonicMs: 1000 + captureCalls,
              sequence: captureCalls + 100,
              deviceId: "pc-local:windows",
              targetId: "target",
              metricName: "frame_time_ms",
              value: 16.67,
              unit: "ms",
              source: "PresentMon:CSV",
              precision: "estimated",
              confidence: "high",
              tags: { platform: "windows", experimental: true, realtime: true }
            }
          ]);
        },
        async abort() {
          // No-op.
        }
      })
    });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "pc-realtime-presentmon",
      name: "PC",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: {
        enablePresentMonRealtime: true,
        presentMonRealtimeChunkMs: 1000
      }
    });
    const events = await collect(collector.streamMetrics(session.id), 4);
    await collector.stopSession(session.id);
    expect(captureCalls).toBeGreaterThanOrEqual(1);
    expect(events.some((event) => event.metricName === "fps")).toBe(true);
    expect(events.some((event) => event.metricName === "frame_time_ms")).toBe(true);
  });

  it("aborts pending PresentMon capture on session stop", async () => {
    let aborted = false;
    const adapter = new FakeProcessAdapter();
    adapter.processes = [processInfo()];
    adapter.queue.set(4321, [processInfo(), processInfo()]);
    const collector = new PcCollector({
      processAdapter: adapter,
      platform: "win32",
      presentMonRuntimeFactory: () => ({
        async capture() {
          return await new Promise<PresentMonCaptureResult>(() => undefined);
        },
        async abort() {
          aborted = true;
        }
      })
    });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "pc-abort",
      name: "PC",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: { enablePresentMonCapture: true }
    });
    await collector.stopSession(session.id);
    expect(aborted).toBe(true);
  });
});
