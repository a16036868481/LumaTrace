import { describe, expect, it } from "vitest";
import { matchPresentMonRows, parsePresentMonCsv, type WindowsProcessInfo } from "../src";
import { readPcFixture } from "./fixture";

const target: WindowsProcessInfo = {
  pid: 4321,
  name: "Game.exe",
  executablePath: "C:\\Games\\Game.exe",
  startTimeMs: 100
};

describe("PresentMonProcessMatcher", () => {
  it("matches target PID with high confidence", () => {
    const rows = parsePresentMonCsv(readPcFixture("presentmon_csv_pid_match_sample.csv")).rows;
    const result = matchPresentMonRows(target, rows);
    expect(result.status).toBe("matched");
    expect(result.confidence).toBe("high");
    expect(result.matchedRows).toHaveLength(3);
  });

  it("matches process name when PID is absent", () => {
    const rows = parsePresentMonCsv("Application,Runtime,MsBetweenPresents\nGame.exe,D3D12,16.7").rows;
    const result = matchPresentMonRows(target, rows);
    expect(result.status).toBe("matched");
    expect(result.confidence).toBe("medium");
  });

  it("marks same process name with multiple PIDs as ambiguous", () => {
    const rows = parsePresentMonCsv(readPcFixture("presentmon_csv_multi_process_sample.csv")).rows;
    const result = matchPresentMonRows({ ...target, pid: 1111 }, rows);
    expect(result.status).toBe("ambiguous");
    expect(result.matchedRows).toHaveLength(0);
  });

  it("does not match unknown or unrelated rows", () => {
    const unrelated = parsePresentMonCsv(readPcFixture("presentmon_csv_no_target_sample.csv")).rows;
    expect(matchPresentMonRows(target, unrelated).status).toBe("no_match");

    const unknown = parsePresentMonCsv(readPcFixture("presentmon_csv_short_lived_unknown_sample.csv")).rows;
    expect(matchPresentMonRows(target, unknown).status).toBe("no_match");
  });
});
