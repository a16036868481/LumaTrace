import { describe, expect, it } from "vitest";
import { parseBattery } from "../src/parsers/parseBattery";
import { readAndroidFixture } from "./fixture";

describe("parseBattery", () => {
  it("parses battery fields and unit conversions", () => {
    const parsed = parseBattery(readAndroidFixture("dumpsys_battery_sample.txt"));
    expect(parsed).toMatchObject({
      acPowered: false,
      usbPowered: true,
      wirelessPowered: false,
      plugged: true,
      level: 85,
      scale: 100,
      levelPercent: 85,
      voltageMv: 4123,
      rawTemperature: 320,
      temperatureC: 32,
      maxChargingCurrentUa: 500000,
      maxChargingCurrentMa: 500,
      currentNowUa: -120000,
      currentNowMa: -120
    });
  });

  it("skips missing fields and scale zero percent", () => {
    const parsed = parseBattery(readAndroidFixture("dumpsys_battery_missing_fields_sample.txt"));
    expect(parsed.levelPercent).toBeUndefined();
    expect(parsed.temperatureC).toBeUndefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
