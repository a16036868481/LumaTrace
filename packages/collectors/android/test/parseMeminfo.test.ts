import { describe, expect, it } from "vitest";
import { parseMeminfo } from "../src/parsers/parseMeminfo";
import { readAndroidFixture } from "./fixture";

describe("parseMeminfo", () => {
  it("parses modern dumpsys meminfo with app summary", () => {
    const parsed = parseMeminfo(readAndroidFixture("dumpsys_meminfo_package_sample.txt"));
    expect(parsed.unavailable).toBe(false);
    expect(parsed.totalPssKb).toBe(123456);
    expect(parsed.totalPssMb).toBeCloseTo(120.56, 2);
    expect(parsed.nativeHeapKb).toBe(51200);
    expect(parsed.dalvikHeapKb).toBe(30720);
    expect(parsed.javaHeapKb).toBe(40960);
    expect(parsed.privateDirtyKb).toBe(100000);
    expect(parsed.swapPssKb).toBe(2048);
    expect(parsed.summary?.TOTAL).toBe(123456);
  });

  it("parses legacy meminfo", () => {
    const parsed = parseMeminfo(readAndroidFixture("dumpsys_meminfo_legacy_sample.txt"));
    expect(parsed.totalPssKb).toBe(65536);
    expect(parsed.nativeHeapKb).toBe(20480);
    expect(parsed.dalvikHeapKb).toBe(10240);
  });

  it("returns unavailable result for no process", () => {
    const parsed = parseMeminfo(readAndroidFixture("dumpsys_meminfo_unavailable_sample.txt"));
    expect(parsed.unavailable).toBe(true);
    expect(parsed.totalPssMb).toBeUndefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("warns on malformed lines without crashing", () => {
    const parsed = parseMeminfo("Applications Memory Usage\nNative Heap bad\n");
    expect(parsed.totalPssMb).toBeUndefined();
    expect(parsed.warnings).toContain("Unable to parse total PSS from dumpsys meminfo.");
  });
});
