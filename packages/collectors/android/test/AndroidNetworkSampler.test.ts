import { describe, expect, it } from "vitest";
import { AndroidNetworkSampler } from "../src/sampling/AndroidNetworkSampler";
import { FakeSamplingAdbClient } from "./fakeAdbClient";
import { readAndroidFixture } from "./fixture";
import { createSamplerContext } from "./samplerContext";

describe("AndroidNetworkSampler", () => {
  it("uses the first UID sample as baseline and emits UID-level bytes/rates on the second sample", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const sampler = new AndroidNetworkSampler({ adbClient, context: createSamplerContext({ sampleIntervalMs: 1000 }) });

    await expect(sampler.sample()).resolves.toEqual([]);
    const events = await sampler.sample();

    expect(events.map((event) => event.metricName)).toEqual([
      "network_rx_bytes",
      "network_tx_bytes",
      "network_rx_rate_bps",
      "network_tx_rate_bps"
    ]);
    expect(events[0]).toMatchObject({
      value: 4500,
      source: "adb:dumpsys netstats detail",
      precision: "estimated",
      confidence: "medium"
    });
    expect(events[0]?.tags).toMatchObject({
      scope: "app_uid",
      uid: 10123,
      sampler: "network"
    });
  });

  it("falls back to device-level /proc/net/dev when UID is missing", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.packageUid = null;
    const sampler = new AndroidNetworkSampler({ adbClient, context: createSamplerContext({ sampleIntervalMs: 1000 }) });

    await expect(sampler.sample()).resolves.toEqual([]);
    const events = await sampler.sample();

    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      metricName: "network_rx_bytes",
      value: 5000,
      source: "adb:/proc/net/dev",
      precision: "device_level",
      confidence: "low"
    });
    expect(events[0]?.tags).toMatchObject({
      scope: "device",
      interfaces: "wlan0,rmnet_data0",
      fallbackReason: "UID-level network stats unavailable"
    });
  });

  it("falls back to device-level when netstats fails", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.failMethods.add("readUidNetworkStats");
    const sampler = new AndroidNetworkSampler({ adbClient, context: createSamplerContext({ sampleIntervalMs: 1000 }) });

    await sampler.sample();
    const events = await sampler.sample();

    expect(events[0]?.precision).toBe("device_level");
    expect(events[0]?.tags?.scope).toBe("device");
  });

  it("skips counter reset and invalid sample windows without fake metrics", async () => {
    const resetClient = new FakeSamplingAdbClient();
    resetClient.netstatsDetailQueue = [
      readAndroidFixture("dumpsys_netstats_detail_uid_sample_2.txt"),
      readAndroidFixture("dumpsys_netstats_detail_uid_sample.txt")
    ];
    const resetSampler = new AndroidNetworkSampler({
      adbClient: resetClient,
      context: createSamplerContext({ sampleIntervalMs: 1000 })
    });
    await resetSampler.sample();
    await expect(resetSampler.sample()).resolves.toEqual([]);

    const invalidWindowClient = new FakeSamplingAdbClient();
    const invalidWindowSampler = new AndroidNetworkSampler({
      adbClient: invalidWindowClient,
      context: createSamplerContext({ sampleIntervalMs: 0 })
    });
    await invalidWindowSampler.sample();
    await expect(invalidWindowSampler.sample()).resolves.toEqual([]);
  });
});
