import { METRIC_NAMES, METRIC_UNITS, type MetricEvent, type Tags } from "@lumatrace/core";
import type { AndroidBatteryInfo } from "../parsers/parseBattery";
import type { AndroidAdbClientLike } from "../types";
import { createAndroidMetricEvent, type AndroidSamplerContext } from "./AndroidSamplerTypes";

export interface AndroidBatterySamplerOptions {
  adbClient: AndroidAdbClientLike;
  context: AndroidSamplerContext;
}

function batteryTags(info: AndroidBatteryInfo): Tags {
  const tags: Tags = {
    parserVersion: "android-battery-v1",
    sampler: "dumpsys_battery"
  };
  for (const [key, value] of Object.entries({
    status: info.status,
    health: info.health,
    plugged: info.plugged,
    scale: info.scale,
    rawTemperatureTenthC: info.rawTemperature,
    rawCurrentUa: info.currentNowUa,
    maxChargingCurrentUa: info.maxChargingCurrentUa,
    maxChargingVoltageUv: info.maxChargingVoltageUv,
    present: info.present,
    acPowered: info.acPowered,
    usbPowered: info.usbPowered,
    wirelessPowered: info.wirelessPowered
  })) {
    if (value !== undefined) {
      tags[key] = value;
    }
  }
  if (info.warnings.length > 0) {
    tags.warningCount = info.warnings.length;
  }
  return tags;
}

export class AndroidBatterySampler {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly context: AndroidSamplerContext;

  constructor(options: AndroidBatterySamplerOptions) {
    this.adbClient = options.adbClient;
    this.context = options.context;
  }

  async sample(): Promise<MetricEvent[]> {
    const info = await this.adbClient.readBattery(this.context.serial);
    const tags = batteryTags(info);
    const events: MetricEvent[] = [];

    if (info.levelPercent !== undefined) {
      events.push(
        createAndroidMetricEvent({
          context: this.context,
          metricName: METRIC_NAMES.BATTERY_LEVEL_PERCENT,
          value: info.levelPercent,
          unit: METRIC_UNITS.PERCENT,
          source: "adb:dumpsys battery",
          precision: "estimated",
          confidence: "medium",
          parserVersion: "android-battery-v1",
          tags
        })
      );
    }
    if (info.temperatureC !== undefined) {
      events.push(
        createAndroidMetricEvent({
          context: this.context,
          metricName: METRIC_NAMES.BATTERY_TEMPERATURE_C,
          value: info.temperatureC,
          unit: METRIC_UNITS.CELSIUS,
          source: "adb:dumpsys battery",
          precision: "estimated",
          confidence: "medium",
          parserVersion: "android-battery-v1",
          tags
        })
      );
    }
    if (info.voltageMv !== undefined) {
      events.push(
        createAndroidMetricEvent({
          context: this.context,
          metricName: METRIC_NAMES.BATTERY_VOLTAGE_MV,
          value: info.voltageMv,
          unit: METRIC_UNITS.MILLIVOLTS,
          source: "adb:dumpsys battery",
          precision: "estimated",
          confidence: "medium",
          parserVersion: "android-battery-v1",
          tags
        })
      );
    }
    if (info.currentNowMa !== undefined) {
      events.push(
        createAndroidMetricEvent({
          context: this.context,
          metricName: METRIC_NAMES.BATTERY_CURRENT_MA,
          value: info.currentNowMa,
          unit: METRIC_UNITS.MILLIAMPS,
          source: "adb:dumpsys battery",
          precision: "estimated",
          confidence: "medium",
          parserVersion: "android-battery-v1",
          tags
        })
      );
    }

    return events;
  }
}
