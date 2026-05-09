import { describe, expect, it } from "vitest";
import { calculateSystemCpuPercent, parseProcStat } from "../src/parsers/parseProcStat";
import { readAndroidFixture } from "./fixture";

describe("parseProcStat", () => {
  it("parses /proc/stat and calculates delta CPU", () => {
    const first = parseProcStat(readAndroidFixture("proc_stat_sample_1.txt"));
    const second = parseProcStat(readAndroidFixture("proc_stat_sample_2.txt"));
    expect(first).toMatchObject({ coreCount: 2, idleJiffies: 10200 });
    expect(second).not.toBeNull();
    expect(calculateSystemCpuPercent(first!, second!)).toBeCloseTo(39.02, 2);
  });

  it("supports missing optional fields", () => {
    const parsed = parseProcStat("cpu  1 2 3 4\n");
    expect(parsed?.fields).toMatchObject({ user: 1, nice: 2, system: 3, idle: 4, iowait: 0 });
  });

  it("returns null for invalid output and zero delta", () => {
    expect(parseProcStat("intr 1 2")).toBeNull();
    const parsed = parseProcStat("cpu  1 2 3 4\n");
    expect(parsed === null ? null : calculateSystemCpuPercent(parsed, parsed)).toBeNull();
  });
});
