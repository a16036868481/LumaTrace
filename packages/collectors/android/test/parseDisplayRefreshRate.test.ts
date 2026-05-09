import { describe, expect, it } from "vitest";
import { parseDisplayRefreshRate } from "../src/parsers/parseDisplayRefreshRate";
import { readAndroidFixture } from "./fixture";

describe("parseDisplayRefreshRate", () => {
  it("parses active and supported refresh rates", () => {
    const parsed = parseDisplayRefreshRate(readAndroidFixture("display_refresh_rate_sample.txt"));

    expect(parsed.activeDisplayId).toBe("0");
    expect(parsed.activeRefreshRate).toBe(120);
    expect(parsed.supportedRefreshRates).toEqual([60, 90, 120]);
  });

  it("supports Hz and fps variants", () => {
    expect(parseDisplayRefreshRate("active refreshRate=90Hz\nmode fps=60").activeRefreshRate).toBe(90);
    expect(parseDisplayRefreshRate("refreshRate: 60 fps").activeRefreshRate).toBe(60);
  });

  it("does not fabricate refresh rate when output is missing or malformed", () => {
    expect(parseDisplayRefreshRate("").activeRefreshRate).toBeUndefined();
    const malformed = parseDisplayRefreshRate("Display 0:\n  no refresh here");
    expect(malformed.activeRefreshRate).toBeUndefined();
    expect(malformed.warnings).toContain("No active display refresh rate was parsed.");
  });
});
