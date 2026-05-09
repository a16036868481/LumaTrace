import { describe, expect, it } from "vitest";
import { calculateDeviceNetworkDelta, parseProcNetDev } from "../src/parsers/parseProcNetDev";
import { readAndroidFixture } from "./fixture";

describe("parseProcNetDev", () => {
  it("parses interfaces, excludes loopback by default, and calculates deltas/rates", () => {
    const first = parseProcNetDev(readAndroidFixture("proc_net_dev_sample_1.txt"));
    const second = parseProcNetDev(readAndroidFixture("proc_net_dev_sample_2.txt"));

    expect(first.includedInterfaces).toEqual(["wlan0", "rmnet_data0"]);
    expect(first.totalRxBytes).toBe(120000);
    expect(first.totalTxBytes).toBe(60000);

    const delta = calculateDeviceNetworkDelta(first, second, 1000);
    expect(delta).toMatchObject({
      rxBytes: 5000,
      txBytes: 2700,
      rxRateBytesPerSecond: 5000,
      txRateBytesPerSecond: 2700
    });
  });

  it("supports include/exclude interface options", () => {
    const snapshot = parseProcNetDev(readAndroidFixture("proc_net_dev_sample_1.txt"), {
      includeInterfaces: ["wlan0"],
      excludeLoopback: true
    });
    expect(snapshot.includedInterfaces).toEqual(["wlan0"]);
    expect(snapshot.totalRxBytes).toBe(100000);
  });

  it("records warnings for malformed lines and returns null on negative deltas", () => {
    const malformed = parseProcNetDev(readAndroidFixture("proc_net_dev_malformed_sample.txt"));
    expect(malformed.warnings.length).toBeGreaterThan(0);
    expect(malformed.includedInterfaces).toEqual(["eth0"]);

    const first = parseProcNetDev(readAndroidFixture("proc_net_dev_sample_2.txt"));
    const second = parseProcNetDev(readAndroidFixture("proc_net_dev_sample_1.txt"));
    expect(calculateDeviceNetworkDelta(first, second, 1000)).toBeNull();
    expect(calculateDeviceNetworkDelta(second, first, 0)).toBeNull();
  });
});
