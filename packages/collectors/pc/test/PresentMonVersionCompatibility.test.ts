import { describe, expect, it } from "vitest";
import { detectPresentMonCompatibility } from "../src";
import { readPcFixture } from "./fixture";

describe("PresentMonVersionCompatibility", () => {
  it("detects modern PID/timed/output support", () => {
    const compatibility = detectPresentMonCompatibility(
      readPcFixture("presentmon_version_modern_sample.txt"),
      readPcFixture("presentmon_help_modern_sample.txt")
    );
    expect(compatibility.version).toBe("2.2.0");
    expect(compatibility.supportsOutputFile).toBe(true);
    expect(compatibility.supportsTimedCapture).toBe(true);
    expect(compatibility.supportsProcessIdFilter).toBe(true);
    expect(compatibility.recommendedArgsStyle).toBe("long");
  });

  it("handles legacy help and PID fallback", () => {
    const compatibility = detectPresentMonCompatibility(
      readPcFixture("presentmon_version_legacy_sample.txt"),
      readPcFixture("presentmon_help_legacy_sample.txt")
    );
    expect(compatibility.supportsProcessIdFilter).toBe(false);
    expect(compatibility.supportsProcessNameFilter).toBe(true);
    expect(compatibility.unsupportedReason).toBeUndefined();
  });

  it("marks malformed help unsupported when output or timed capture is missing", () => {
    const compatibility = detectPresentMonCompatibility("", "PresentMon help");
    expect(compatibility.unsupportedReason).toMatch(/timed CSV/i);
    expect(compatibility.warnings.length).toBeGreaterThan(0);
  });
});
