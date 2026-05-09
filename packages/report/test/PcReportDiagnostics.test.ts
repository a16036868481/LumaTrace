import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type Device, type MetricEvent } from "@lumatrace/core";
import type { DiagnosticRecord } from "@lumatrace/storage";
import { ReportGenerator, type ReportInput } from "../src";

const device: Device = {
  id: "pc-local:windows",
  platform: "windows",
  name: "Local PC",
  connectionType: "local",
  capabilities: [
    {
      metricName: METRIC_NAMES.FPS,
      platform: "windows",
      status: "requires_tool",
      source: "PresentMon",
      reason: "PresentMon required."
    }
  ]
};

function pcMetric(overrides: Partial<MetricEvent>): MetricEvent {
  return {
    sessionId: "pc-report",
    timestampMs: 1000,
    deviceId: device.id,
    targetId: "pc-windows-process:4321:4321-1777359600000",
    metricName: METRIC_NAMES.CPU_PERCENT,
    value: 10,
    unit: METRIC_UNITS.PERCENT,
    source: "windows:process-times",
    precision: "estimated",
    confidence: "medium",
    tags: { platform: "windows", pid: 4321 },
    ...overrides
  };
}

const diagnostics: DiagnosticRecord[] = [
  {
    id: "pc-pid",
    timestampMs: 1200,
    level: "warn",
    category: "pc:process",
    message: "PC process exited.",
    sessionId: "pc-report",
    deviceId: device.id,
    details: {
      pcCode: "PROCESS_EXITED",
      executablePath: "C:\\Users\\<user>\\Games\\Game.exe"
    }
  }
];

function input(): ReportInput {
  return {
    session: {
      id: "pc-report",
      name: "PC Report",
      deviceId: device.id,
      targetId: "pc-windows-process:4321:4321-1777359600000",
      startedAt: 1000,
      endedAt: 3000,
      sampleIntervalMs: 100,
      status: "stopped"
    },
    device,
    target: {
      id: "pc-windows-process:4321:4321-1777359600000",
      name: "Game.exe",
      platform: "windows",
      type: "process",
      pid: 4321
    },
    markers: [],
    diagnostics,
    metrics: [
      pcMetric({ value: 12 }),
      pcMetric({
        metricName: METRIC_NAMES.MEMORY_MB,
        value: 256,
        unit: METRIC_UNITS.MEGABYTES,
        source: "windows:process-memory",
        confidence: "high"
      })
    ]
  };
}

describe("PC report diagnostics", () => {
  it("adds PC diagnostics and PresentMon notices without raw private paths", () => {
    const report = new ReportGenerator().generate(input(), { includeRawMetricsInHtml: true });
    const json = JSON.parse(report.json) as {
      pcDiagnostics?: {
        sourcePrecisionNotices: string[];
        diagnosticsTimeline: DiagnosticRecord[];
      };
    };

    expect(report.summary.avgCpuPercent).toBe(12);
    expect(report.summary.avgMemoryMb).toBe(256);
    expect(json.pcDiagnostics?.sourcePrecisionNotices.join(" ")).toContain("PresentMon");
    expect(json.pcDiagnostics?.diagnosticsTimeline[0]?.message).toContain("process exited");
    expect(report.html).toContain("PC Diagnostics");
    expect(report.html).toContain("PresentMon is required");
    expect(report.html).not.toContain("C:\\Users\\player");
    expect(report.html).not.toContain("stack");
  });

  it("summarizes explicit PresentMon FPS/frame-time metrics and keeps raw CSV paths out", () => {
    const report = new ReportGenerator().generate(
      {
        ...input(),
        diagnostics: [
          ...diagnostics,
          {
            id: "pc-presentmon",
            timestampMs: 1500,
            level: "info",
            category: "pc:presentmon",
            message: "PresentMon capture completed.",
            sessionId: "pc-report",
            deviceId: device.id,
            details: {
              pcCode: "PRESENTMON_CAPTURE_COMPLETED",
              outputFilePath: "C:\\Users\\alice\\Temp\\capture.csv",
              rawCsv: "Application,ProcessID,MsBetweenPresents\nGame.exe,4321,16.67",
              commandLine: "Game.exe --token secret"
            }
          },
          {
            id: "pc-permission",
            timestampMs: 1501,
            level: "warn",
            category: "pc:presentmon",
            message: "Windows Windows log access group may help.",
            sessionId: "pc-report",
            deviceId: device.id,
            details: {
              pcCode: "PRESENTMON_LOG_ACCESS_USERS_HINT"
            }
          },
          {
            id: "pc-no-data",
            timestampMs: 1502,
            level: "warn",
            category: "pc:presentmon",
            message: "No PresentMon rows matched the target PID or process name.",
            sessionId: "pc-report",
            deviceId: device.id,
            details: {
              pcCode: "PRESENTMON_TARGET_NO_MATCH"
            }
          }
        ],
        metrics: [
          pcMetric({
            metricName: METRIC_NAMES.FRAME_TIME_MS,
            value: 16.67,
            unit: METRIC_UNITS.MILLISECONDS,
            source: "PresentMon:CSV",
            confidence: "high",
            tags: { platform: "windows", experimental: true, captureId: "capture" }
          }),
          pcMetric({
            metricName: METRIC_NAMES.FPS,
            value: 60,
            unit: METRIC_UNITS.FPS,
            source: "PresentMon:CSV",
            confidence: "high",
            tags: { platform: "windows", experimental: true, captureId: "capture" }
          })
        ]
      },
      { includeRawMetricsInHtml: true }
    );
    const json = JSON.parse(report.json) as {
      pcDiagnostics?: {
        sourcePrecisionNotices: string[];
        permissionNotices: string[];
        noDataReasons: string[];
      };
    };

    expect(report.summary.avgFps).toBe(60);
    expect(report.summary.p95FrameTimeMs).toBe(16.67);
    expect(json.pcDiagnostics?.sourcePrecisionNotices.join(" ")).toContain("explicit CSV capture");
    expect(json.pcDiagnostics?.permissionNotices.join(" ")).toContain("Windows log access group");
    expect(json.pcDiagnostics?.noDataReasons.join(" ")).toContain("No PresentMon rows");
    expect(report.html).toContain("PresentMon FPS/frame-time metrics");
    expect(report.html).toContain("PresentMon status");
    expect(report.html).not.toContain("C:\\Users\\alice");
    expect(report.html).not.toContain("Application,ProcessID");
    expect(report.html).not.toContain("--token");
  });
});
