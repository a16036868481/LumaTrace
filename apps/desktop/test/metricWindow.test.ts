import { describe, expect, it } from "vitest";
import { filterSeriesByWindow, filterSeriesStateByWindow } from "../src/utils/metricWindow";
import type { MetricSeriesPoint, MetricSeriesState } from "../src/utils/metricSeries";

function point(timestampMs: number, value: number | null): MetricSeriesPoint {
  return {
    timestampMs,
    value,
    source: "mock",
    precision: "estimated",
    confidence: "high"
  };
}

describe("metricWindow", () => {
  it("filters 30s, 1m, 5m, and all windows while preserving nulls", () => {
    const series = [point(0, 1), point(31_000, null), point(61_000, 3), point(301_000, 4)];

    expect(filterSeriesByWindow(series, "30s", 301_000).map((item) => item.timestampMs)).toEqual([
      301_000
    ]);
    expect(filterSeriesByWindow(series, "1m", 61_000).map((item) => item.timestampMs)).toEqual([
      31_000,
      61_000
    ]);
    expect(filterSeriesByWindow(series, "5m", 301_000).map((item) => item.timestampMs)).toEqual([
      31_000,
      61_000,
      301_000
    ]);
    expect(filterSeriesByWindow(series, "all").map((item) => item.value)).toEqual([
      1,
      null,
      3,
      4
    ]);
  });

  it("sorts by timestamp", () => {
    expect(filterSeriesByWindow([point(2, 2), point(1, 1)], "all").map((item) => item.timestampMs)).toEqual([
      1,
      2
    ]);
  });

  it("preserves and filters every live metric series", () => {
    const state: MetricSeriesState = {
      fps: [point(1_000, 60)],
      cpu_percent: [point(1_000, 12)],
      memory_mb: [point(1_000, 128)],
      gpu_utilization: [point(1_000, 24), point(41_000, 36)],
      power_w: [point(1_000, 55), point(41_000, 65)],
      temperature_c: [point(1_000, 48), point(41_000, 52)]
    };

    const filtered = filterSeriesStateByWindow(state, "30s", 41_000);

    expect(Object.keys(filtered)).toEqual(Object.keys(state));
    expect(filtered.gpu_utilization?.map((item) => item.value)).toEqual([36]);
    expect(filtered.power_w?.map((item) => item.value)).toEqual([65]);
    expect(filtered.temperature_c?.map((item) => item.value)).toEqual([52]);
  });
});
