import { describe, expect, it } from "vitest";
import { parsePresentMonCsv } from "../src";
import { readPcFixture } from "./fixture";

describe("PresentMonCsvParser", () => {
  it("parses common PresentMon CSV columns and summary", () => {
    const parsed = parsePresentMonCsv(readPcFixture("presentmon_csv_sample.csv"));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.processId).toBe(4321);
    expect(parsed.summary?.averagePresentedFps).toBeCloseTo(59.5);
    expect(parsed.summary?.averageMsBetweenPresents).toBeCloseTo(16.8);
  });

  it("parses frame generation related columns without faking missing FPS", () => {
    const parsed = parsePresentMonCsv(readPcFixture("presentmon_csv_with_frame_generation_sample.csv"));
    expect(parsed.rows[0]?.displayFps).toBe(120);
    expect(parsed.rows[0]?.cpuFrameTimeMs).toBe(12.3);
  });

  it("handles empty and malformed CSV", () => {
    expect(parsePresentMonCsv(readPcFixture("presentmon_csv_empty_sample.csv")).warnings.length).toBeGreaterThan(0);
    const malformed = parsePresentMonCsv(readPcFixture("presentmon_csv_malformed_sample.csv"));
    expect(malformed.rows).toHaveLength(1);
    expect(malformed.warnings.length).toBeGreaterThan(0);
  });
});
