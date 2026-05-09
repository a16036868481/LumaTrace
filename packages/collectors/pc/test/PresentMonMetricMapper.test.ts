import { describe, expect, it } from "vitest";
import {
  mapPresentMonRowsToMetrics,
  matchPresentMonRows,
  parsePresentMonCsv,
  type WindowsProcessInfo
} from "../src";
import { readPcFixture } from "./fixture";

const target: WindowsProcessInfo = {
  pid: 4321,
  name: "Game.exe",
  startTimeMs: 100
};

function mapCsv(csv: string) {
  const rows = parsePresentMonCsv(csv).rows;
  const match = matchPresentMonRows(target, rows);
  return mapPresentMonRowsToMetrics({
    sessionId: "session",
    deviceId: "pc-local:windows",
    targetId: "target",
    target,
    captureId: "capture",
    captureStartedAtMs: 1000,
    presentMonVersion: "2.0.0",
    match
  });
}

describe("PresentMonMetricMapper", () => {
  it("maps MsBetweenPresents to frame_time_ms and FPS columns to fps", () => {
    const result = mapCsv(readPcFixture("presentmon_csv_pid_match_sample.csv"));
    expect(result.metrics.some((event) => event.metricName === "frame_time_ms")).toBe(true);
    expect(result.metrics.some((event) => event.metricName === "fps")).toBe(true);
    expect(result.metrics[0]?.source).toBe("PresentMon:CSV");
    expect(result.metrics[0]?.tags?.presentMonVersion).toBe("2.0.0");
    expect(result.metrics[0]?.tags?.experimental).toBe(true);
  });

  it("derives instantaneous fps from frame time without fabricating frame time from average fps", () => {
    const result = mapCsv("Application,ProcessID,Runtime,MsBetweenPresents\nGame.exe,4321,D3D12,20");
    const fps = result.metrics.find((event) => event.metricName === "fps");
    const frame = result.metrics.find((event) => event.metricName === "frame_time_ms");
    expect(frame?.value).toBe(20);
    expect(fps?.value).toBe(50);
    expect(fps?.tags?.derivedFromFrameTime).toBe(true);

    const avgOnly = mapCsv("Application,ProcessID,Runtime,FPS\nGame.exe,4321,D3D12,60");
    expect(avgOnly.metrics.some((event) => event.metricName === "fps")).toBe(true);
    expect(avgOnly.metrics.some((event) => event.metricName === "frame_time_ms")).toBe(false);
  });

  it("ignores invalid frame times instead of outputting zero", () => {
    const result = mapCsv("Application,ProcessID,Runtime,MsBetweenPresents\nGame.exe,4321,D3D12,0");
    expect(result.metrics).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/non-positive/i);
  });
});
