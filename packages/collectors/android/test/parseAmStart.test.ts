import { describe, expect, it } from "vitest";
import { parseAmStart } from "../src/parsers/parseAmStart";
import { readAndroidFixture } from "./fixture";

describe("parseAmStart", () => {
  it("parses a successful am start -W result", () => {
    const result = parseAmStart(readAndroidFixture("am_start_success_sample.txt"));

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      activity: "com.example.app/.MainActivity",
      thisTimeMs: 123,
      totalTimeMs: 456,
      waitTimeMs: 789
    });
  });

  it("preserves warnings without turning missing times into zero", () => {
    const result = parseAmStart(readAndroidFixture("am_start_warning_sample.txt"));

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("Activity not started, its current task has been brought to the front");
    expect(result.thisTimeMs).toBeUndefined();
    expect(result.totalTimeMs).toBe(42);
  });

  it("returns ok false for errors", () => {
    const result = parseAmStart(readAndroidFixture("am_start_error_sample.txt"));

    expect(result.ok).toBe(false);
    expect(result.warnings.some((warning) => warning.includes("Activity class"))).toBe(true);
  });

  it("handles malformed output", () => {
    const result = parseAmStart("unexpected output");

    expect(result.ok).toBe(false);
    expect(result.thisTimeMs).toBeUndefined();
    expect(result.warnings).toContain("am start output did not include Status: ok.");
  });
});
