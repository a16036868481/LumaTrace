import { describe, expect, it } from "vitest";
import { AndroidCollector } from "../src/AndroidCollector";
import { FakeSamplingAdbClient } from "./fakeAdbClient";

async function collectEvents<T>(iterable: AsyncIterable<T>, count: number, timeoutMs = 800): Promise<T[]> {
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

async function startAndroidSession(adbClient: FakeSamplingAdbClient) {
  const collector = new AndroidCollector({ adbClient });
  const [device] = await collector.discoverDevices();
  const [target] = await collector.listTargets(device!.id);
  const session = await collector.startSession({
    id: "android-network-session",
    name: "Android network",
    deviceId: device!.id,
    targetId: target!.id,
    sampleIntervalMs: 1
  });
  return { collector, session };
}

describe("AndroidCollector network sessions", () => {
  it("streams UID-level network metrics with source, precision, confidence, and tags", async () => {
    const { collector, session } = await startAndroidSession(new FakeSamplingAdbClient());
    const events = await collectEvents(collector.streamMetrics(session.id), 12);

    const network = events.find((event) => event.metricName === "network_rx_bytes");
    expect(network).toMatchObject({
      source: "adb:dumpsys netstats detail",
      precision: "estimated",
      confidence: "medium"
    });
    expect(network?.tags).toMatchObject({
      scope: "app_uid",
      uid: 10123
    });
    expect(events.some((event) => event.metricName === "fps")).toBe(false);
    await collector.stopSession(session.id);
  });

  it("streams device-level fallback metrics without presenting them as app-level traffic", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.packageUid = null;
    const { collector, session } = await startAndroidSession(adbClient);
    const events = await collectEvents(collector.streamMetrics(session.id), 12);

    const network = events.find((event) => event.metricName === "network_rx_bytes");
    expect(network).toMatchObject({
      source: "adb:/proc/net/dev",
      precision: "device_level",
      confidence: "low"
    });
    expect(network?.tags).toMatchObject({
      scope: "device",
      interfaces: "wlan0,rmnet_data0"
    });
    await collector.stopSession(session.id);
  });
});
