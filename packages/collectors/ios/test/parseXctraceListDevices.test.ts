import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseXctraceListDevices } from "../src/parsers/parseXctraceListDevices";

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "../../../tests/fixtures/ios", name), "utf8");
}

describe("parseXctraceListDevices", () => {
  it("parses physical iOS devices and simulators while skipping non-iOS entries", () => {
    const result = parseXctraceListDevices(fixture("xctrace_devices_sample.txt"));
    expect(result.devices).toHaveLength(4);
    expect(result.devices.map((device) => device.name)).toEqual([
      "Alice iPhone",
      "QA iPad",
      "iPhone 15 Pro",
      "iPad Air"
    ]);
    expect(result.devices[0]).toMatchObject({
      udid: "00008110-001C195E0E91801E",
      osVersion: "17.5",
      deviceType: "device"
    });
    expect(result.devices[2]).toMatchObject({
      deviceType: "simulator",
      state: "Booted"
    });
    expect(result.warnings.some((warning) => warning.includes("MacBook"))).toBe(true);
  });

  it("returns a clear warning when no iOS devices are present", () => {
    const result = parseXctraceListDevices(fixture("xctrace_devices_empty_sample.txt"));
    expect(result.devices).toHaveLength(0);
    expect(result.warnings).toContain("No iOS devices or simulators were parsed from xctrace output.");
  });

  it("warns on malformed lines without throwing", () => {
    const result = parseXctraceListDevices(fixture("xctrace_devices_malformed_sample.txt"));
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.name).toBe("Bob iPhone");
    expect(result.warnings.some((warning) => warning.includes("Could not parse"))).toBe(true);
  });
});
