import { describe, expect, it } from "vitest";
import { parseAdbDevices } from "../src/adb/parseAdbDevices";
import { readAndroidFixture } from "./fixture";

describe("parseAdbDevices", () => {
  it("parses empty output", () => {
    expect(parseAdbDevices(readAndroidFixture("adb_devices_empty.txt"))).toEqual([]);
  });

  it("parses one device with long fields", () => {
    const devices = parseAdbDevices(readAndroidFixture("adb_devices_one_device.txt"));
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      serial: "R58M123ABC",
      state: "device",
      product: "oriole",
      model: "Pixel_6",
      device: "oriole",
      transportId: "3"
    });
  });

  it("parses multiple devices", () => {
    const devices = parseAdbDevices(readAndroidFixture("adb_devices_multiple_devices.txt"));
    expect(devices.map((device) => device.serial)).toEqual(["R58M123ABC", "emulator-5554"]);
  });

  it("keeps unauthorized and offline records", () => {
    expect(parseAdbDevices(readAndroidFixture("adb_devices_unauthorized.txt"))[0]?.state).toBe(
      "unauthorized"
    );
    expect(parseAdbDevices(readAndroidFixture("adb_devices_offline.txt"))[0]?.state).toBe("offline");
  });

  it("ignores malformed blank lines", () => {
    expect(parseAdbDevices("List of devices attached\n\n  \n")).toEqual([]);
  });
});
