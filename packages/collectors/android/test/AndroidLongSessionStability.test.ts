import { describe, expect, it } from "vitest";
import { AndroidCollector } from "../src";
import { FakeSamplingAdbClient } from "./fakeAdbClient";

async function collectEvents<T>(iterable: AsyncIterable<T>, count: number, timeoutMs = 1000): Promise<T[]> {
  const events: T[] = [];
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("Timed out collecting async iterable")), timeoutMs);
  });
  const collect = (async () => {
    for await (const event of iterable) {
      events.push(event);
      if (events.length >= count) {
        break;
      }
    }
    return events;
  })();
  return Promise.race([collect, timeout]);
}

describe("Android long-session stability", () => {
  it("keeps a bounded, honest fake long session through missing/rebound and fallbacks", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.packageUid = null;
    adbClient.pidQueue = [12345, 12345, 12345, null, 23456, 23456, 23456, 23456, 23456, 23456];
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();
    const [target] = await collector.listTargets(device!.id);
    const session = await collector.startSession({
      id: "android-long-session",
      name: "Android long session",
      deviceId: device!.id,
      targetId: target!.id,
      sampleIntervalMs: 1,
      options: {
        processMissingPolicy: "pause_process_metrics_keep_device_metrics"
      }
    });

    const events = await collectEvents(collector.streamMetrics(session.id), 24);
    await collector.stopSession(session.id);

    expect(events.length).toBeGreaterThan(10);
    expect(events.some((event) => event.metricName === "cpu_percent")).toBe(true);
    expect(events.some((event) => event.metricName === "memory_mb")).toBe(true);
    expect(events.some((event) => event.metricName === "network_rx_bytes" && event.precision === "device_level")).toBe(true);
    expect(events.filter((event) => event.tags?.processMissing === true).some((event) => event.metricName === "cpu_percent")).toBe(false);
    expect(events.every((event) => !(event.value === 0 && (event.metricName === "cpu_percent" || event.metricName === "memory_mb")))).toBe(true);

    const diagnostics = collector.listDiagnostics({ sessionId: session.id });
    expect(diagnostics.some((event) => event.code === "PID_MISSING")).toBe(true);
    expect(diagnostics.some((event) => event.code === "PID_REBOUND")).toBe(true);
    expect(diagnostics.some((event) => event.code === "NETWORK_FALLBACK_DEVICE_LEVEL")).toBe(true);
  });
});
