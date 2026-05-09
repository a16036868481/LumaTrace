import { describe, expect, it } from "vitest";
import { AndroidBatterySampler } from "../src/sampling/AndroidBatterySampler";
import { parseBattery } from "../src/parsers/parseBattery";
import { FakeSamplingAdbClient } from "./fakeAdbClient";
import { readAndroidFixture } from "./fixture";
import { createSamplerContext } from "./samplerContext";

describe("AndroidBatterySampler", () => {
  it("emits available battery metrics from dumpsys battery", async () => {
    const adbClient = new FakeSamplingAdbClient();
    const sampler = new AndroidBatterySampler({ adbClient, context: createSamplerContext() });

    const events = await sampler.sample();

    expect(events.map((event) => event.metricName)).toEqual([
      "battery_level_percent",
      "battery_temperature_c",
      "battery_voltage_mv",
      "battery_current_ma"
    ]);
    expect(events.every((event) => event.source === "adb:dumpsys battery")).toBe(true);
    expect(events.every((event) => event.precision === "estimated" && event.confidence === "medium")).toBe(true);
  });

  it("skips missing battery fields without emitting zero-valued placeholders", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.battery = parseBattery(readAndroidFixture("dumpsys_battery_missing_fields_sample.txt"));
    const sampler = new AndroidBatterySampler({ adbClient, context: createSamplerContext() });

    const events = await sampler.sample();

    expect(events).toEqual([]);
  });
});
