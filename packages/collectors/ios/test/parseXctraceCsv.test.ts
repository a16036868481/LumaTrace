import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseXctraceCsv } from "../src/parsers/parseXctraceCsv";

function fixture(name: string): string {
  return readFileSync(resolve("../../../tests/fixtures/ios", name), "utf8");
}

describe("parseXctraceCsv", () => {
  it("parses per-row xctrace CSV metrics", () => {
    const result = parseXctraceCsv(fixture("xctrace_csv_sample.csv"));
    expect(result.warnings).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.detectedColumns).toContain("Bundle Identifier");
    expect(result.rows[0]).toMatchObject({
      timestampMs: 0,
      processName: "ExampleGame",
      bundleId: "com.example.game",
      pid: 421,
      fps: 60,
      frameTimeMs: 16.67,
      cpuPercent: 12.5,
      memoryMb: 240.25
    });
  });

  it("warns on malformed rows without crashing", () => {
    const result = parseXctraceCsv(fixture("xctrace_csv_malformed_sample.csv"));
    expect(result.rows).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes("columns"))).toBe(true);
    expect(result.rows[1]?.fps).toBeUndefined();
    expect(result.rows[1]?.frameTimeMs).toBe(17.01);
  });

  it("does not treat average FPS as a per-row FPS source", () => {
    const result = parseXctraceCsv(fixture("xctrace_csv_average_only_sample.csv"));
    expect(result.rows[0]?.fps).toBeUndefined();
    expect(result.warnings.some((warning) => warning.includes("Average FPS"))).toBe(true);
  });

  it("handles empty CSV", () => {
    const result = parseXctraceCsv("");
    expect(result.rows).toEqual([]);
    expect(result.warnings).toContain("xctrace CSV is empty.");
  });
});
