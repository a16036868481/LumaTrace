import { describe, expect, it } from "vitest";
import { formatDuration, formatMetricValue, formatNumber } from "../src/utils/format";

describe("format helpers", () => {
  it("formats numbers and missing values", () => {
    expect(formatNumber(12.345, 1)).toBe("12.3");
    expect(formatNumber(null)).toBe("N/A");
    expect(formatNumber(Number.NaN)).toBe("N/A");
  });

  it("formats durations", () => {
    expect(formatDuration(450)).toBe("450 ms");
    expect(formatDuration(1200)).toBe("1.2 s");
    expect(formatDuration(undefined)).toBe("N/A");
  });

  it("formats metric units", () => {
    expect(formatMetricValue(58.4, "fps")).toBe("58.4 FPS");
    expect(formatMetricValue(16.67, "ms")).toBe("16.7 ms");
    expect(formatMetricValue(42.5, "%")).toBe("42.5%");
    expect(formatMetricValue(512, "MB")).toBe("512.0 MB");
    expect(formatMetricValue(undefined, "fps")).toBe("N/A");
  });
});
