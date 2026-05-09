import { describe, expect, it } from "vitest";
import { parseProcStat } from "../src/parsers/parseProcStat";
import {
  calculateProcessCpuPercent,
  parseProcPidStat
} from "../src/parsers/parseProcPidStat";
import { readAndroidFixture } from "./fixture";

describe("parseProcPidStat", () => {
  it("parses process stat and calculates CPU deltas", () => {
    const firstProc = parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_1.txt"));
    const secondProc = parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_2.txt"));
    const firstSystem = parseProcStat(readAndroidFixture("proc_stat_sample_1.txt"));
    const secondSystem = parseProcStat(readAndroidFixture("proc_stat_sample_2.txt"));
    expect(firstProc).toMatchObject({ pid: 12345, comm: "com.example.app", utime: 200, stime: 100 });
    const sample = calculateProcessCpuPercent(firstProc!, secondProc!, firstSystem!, secondSystem!);
    expect(sample).toMatchObject({
      processJiffiesDelta: 50,
      systemJiffiesDelta: 410,
      coreCount: 2
    });
    expect(sample?.normalizedPercent).toBeCloseTo(12.2, 2);
    expect(sample?.rawPercent).toBeCloseTo(24.39, 2);
  });

  it("handles process names with spaces and parentheses", () => {
    const parsed = parseProcPidStat(readAndroidFixture("proc_pid_stat_with_spaces_sample.txt"));
    expect(parsed?.comm).toBe("com.example app (worker)");
    expect(parsed?.pid).toBe(12346);
  });

  it("returns null for invalid output and negative process delta", () => {
    expect(parseProcPidStat("bad output")).toBeNull();
    const firstProc = parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_2.txt"));
    const secondProc = parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_1.txt"));
    const firstSystem = parseProcStat(readAndroidFixture("proc_stat_sample_1.txt"));
    const secondSystem = parseProcStat(readAndroidFixture("proc_stat_sample_2.txt"));
    expect(calculateProcessCpuPercent(firstProc!, secondProc!, firstSystem!, secondSystem!)).toBeNull();
  });
});
