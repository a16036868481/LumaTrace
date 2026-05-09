import { describe, expect, it } from "vitest";
import { average, maxValue, minValue, percentile, sum } from "../src/stats/percentiles";

describe("percentile", () => {
  it("returns undefined for empty or non-finite samples", () => {
    expect(percentile([], 50)).toBeUndefined();
    expect(percentile([Number.NaN, Number.POSITIVE_INFINITY], 50)).toBeUndefined();
  });

  it("calculates interpolated percentiles from sorted finite values", () => {
    expect(percentile([40, 10, 20, 30], 0)).toBe(10);
    expect(percentile([40, 10, 20, 30], 50)).toBe(25);
    expect(percentile([40, 10, 20, 30], 90)).toBeCloseTo(37);
    expect(percentile([40, 10, 20, 30], 100)).toBe(40);
  });
});

describe("basic numeric helpers", () => {
  it("ignores non-finite values", () => {
    const values = [1, 2, Number.NaN, Number.POSITIVE_INFINITY, 3];

    expect(sum(values)).toBe(6);
    expect(average(values)).toBe(2);
    expect(minValue(values)).toBe(1);
    expect(maxValue(values)).toBe(3);
  });
});
