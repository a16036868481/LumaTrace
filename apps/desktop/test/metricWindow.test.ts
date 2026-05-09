import { describe, expect, it } from "vitest";
import { filterSeriesByWindow } from "../src/utils/metricWindow";
import type { MetricSeriesPoint } from "../src/utils/metricSeries";

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
});
