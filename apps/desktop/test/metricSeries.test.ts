import { describe, expect, it } from "vitest";
import type { MetricEvent } from "../src/api/types";
import {
  appendMetricEventToSeries,
  getLatestMetricByName,
  groupMetricEventsByName,
  normalizeMetricValue,
  type MetricSeriesState
} from "../src/utils/metricSeries";

function metric(overrides: Partial<MetricEvent>): MetricEvent {
  return {
    sessionId: "s1",
    timestampMs: 1000,
    deviceId: "d1",
    targetId: "t1",
    metricName: "fps",
    value: 60,
    unit: "fps",
    source: "mock",
    precision: "estimated",
    confidence: "high",
    ...overrides
  };
}

describe("metric series utilities", () => {
  it("groups and sorts events by metric name", () => {
    const grouped = groupMetricEventsByName([
      metric({ metricName: "fps", timestampMs: 20, sequence: 2 }),
      metric({ metricName: "cpu_percent", timestampMs: 10, sequence: 1, unit: "%" }),
      metric({ metricName: "fps", timestampMs: 10, sequence: 1 })
    ]);

    expect(grouped.fps?.map((event) => event.timestampMs)).toEqual([10, 20]);
    expect(grouped.cpu_percent).toHaveLength(1);
  });

  it("returns latest metric with stable timestamp and sequence ordering", () => {
    const latest = getLatestMetricByName(
      [
        metric({ metricName: "fps", timestampMs: 10, sequence: 2, value: 59 }),
        metric({ metricName: "fps", timestampMs: 10, sequence: 3, value: 58 }),
        metric({ metricName: "fps", timestampMs: 9, sequence: 9, value: 1 })
      ],
      "fps"
    );

    expect(latest?.value).toBe(58);
  });

  it("keeps null values and does not convert them to zero", () => {
    const state = appendMetricEventToSeries({}, metric({ value: null }));

    expect(state.fps?.[0]?.value).toBeNull();
  });

  it("keeps supported Windows live metric series for future real collectors", () => {
    const state = appendMetricEventToSeries(
      {},
      metric({ metricName: "gpu_utilization", unit: "%", value: 72 })
    );

    expect(state.gpu_utilization?.[0]?.value).toBe(72);
  });

  it("keeps Android battery metrics for the unified live dashboard", () => {
    const batteryState = appendMetricEventToSeries(
      {},
      metric({ metricName: "battery_level_percent", unit: "%", value: 81 })
    );
    const state = appendMetricEventToSeries(
      batteryState,
      metric({ metricName: "battery_temperature_c", unit: "C", value: 34.2 })
    );

    expect(state.battery_level_percent?.[0]?.value).toBe(81);
    expect(state.battery_temperature_c?.[0]?.value).toBe(34.2);
  });

  it("keeps CPU and GPU temperature series separate", () => {
    const cpuState = appendMetricEventToSeries(
      {},
      metric({ metricName: "cpu_temperature_c", unit: "C", value: 63 })
    );
    const state = appendMetricEventToSeries(
      cpuState,
      metric({ metricName: "gpu_temperature_c", unit: "C", value: 55 })
    );

    expect(state.cpu_temperature_c?.[0]?.value).toBe(63);
    expect(state.gpu_temperature_c?.[0]?.value).toBe(55);
  });

  it("rejects CPU temperatures emitted by the withdrawn ACPI zone classifier", () => {
    const rejected = metric({
      metricName: "cpu_temperature_c",
      unit: "C",
      value: 27.85,
      source: "windows:acpi-processor-thermal-zone"
    });

    expect(getLatestMetricByName([rejected], "cpu_temperature_c")).toBeNull();
    expect(groupMetricEventsByName([rejected]).cpu_temperature_c).toBeUndefined();
    expect(appendMetricEventToSeries({}, rejected)).toEqual({});
  });

  it("uses normalized CPU percent when available", () => {
    expect(
      normalizeMetricValue(
        metric({
          metricName: "cpu_percent",
          unit: "%",
          value: 120,
          tags: {
            normalizedPercent: 55
          }
        })
      )
    ).toBe(55);
  });

  it("trims series to maxPoints", () => {
    let state: MetricSeriesState = {};
    for (let index = 0; index < 5; index += 1) {
      state = appendMetricEventToSeries(
        state,
        metric({ timestampMs: index, sequence: index, value: index }),
        { maxPoints: 3 }
      );
    }

    expect(state.fps?.map((point) => point.value)).toEqual([2, 3, 4]);
  });
});
