import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type Device, type MetricEvent } from "@lumatrace/core";
import type { DiagnosticRecord } from "@lumatrace/storage";
import { ReportGenerator, type ReportInput } from "../src";

const device: Device = {
  id: "android:<device-serial>",
  platform: "android",
  name: "Pixel",
  connectionType: "usb",
  capabilities: []
};

function metric(overrides: Partial<MetricEvent>): MetricEvent {
  return {
    sessionId: "android-report",
    timestampMs: 1000,
    deviceId: device.id,
    targetId: "android-package:com.example.app",
    metricName: METRIC_NAMES.CPU_PERCENT,
    value: 10,
    unit: METRIC_UNITS.PERCENT,
    source: "adb:test",
    precision: "estimated",
    confidence: "medium",
    ...overrides
  };
}

const diagnostics: DiagnosticRecord[] = [
  {
    id: "diag-network",
    timestampMs: 1010,
    level: "warn",
    category: "network",
    message: "Android network fell back to device-level counters.",
    sessionId: "android-report",
    deviceId: device.id,
    details: {
      androidCode: "NETWORK_FALLBACK_DEVICE_LEVEL",
      stdout: "<redacted>"
    }
  },
  {
    id: "diag-pid",
    timestampMs: 1020,
    level: "info",
    category: "process",
    message: "Android target process rebound to a new PID.",
    sessionId: "android-report",
    deviceId: device.id,
    details: {
      androidCode: "PID_REBOUND",
      previousPid: 12345,
      newPid: 23456
    }
  },
  {
    id: "diag-fps",
    timestampMs: 1030,
    level: "warn",
    category: "fps",
    message: "Android experimental FPS probe did not produce target FPS.",
    sessionId: "android-report",
    deviceId: device.id,
    details: {
      androidCode: "FPS_LAYER_MATCH_AMBIGUOUS"
    }
  }
];

function input(): ReportInput {
  return {
    session: {
      id: "android-report",
      name: "Android Report",
      deviceId: device.id,
      targetId: "android-package:com.example.app",
      startedAt: 1000,
      endedAt: 3000,
      sampleIntervalMs: 100,
      status: "stopped"
    },
    device,
    target: {
      id: "android-package:com.example.app",
      name: "com.example.app",
      packageName: "com.example.app",
      platform: "android",
      type: "app"
    },
    markers: [],
    diagnostics,
    metrics: [
      metric({
        metricName: METRIC_NAMES.NETWORK_RX_BYTES,
        value: 1024,
        unit: METRIC_UNITS.BYTES,
        source: "adb:/proc/net/dev",
        precision: "device_level",
        confidence: "low",
        tags: { scope: "device", intervalMs: 1000 }
      }),
      metric({
        metricName: METRIC_NAMES.NETWORK_TX_BYTES,
        value: 512,
        unit: METRIC_UNITS.BYTES,
        source: "adb:/proc/net/dev",
        precision: "device_level",
        confidence: "low",
        tags: { scope: "device", intervalMs: 1000 }
      }),
      metric({
        metricName: METRIC_NAMES.MEMORY_MB,
        value: 200,
        unit: METRIC_UNITS.MEGABYTES,
        source: "adb:/proc/<pid>/status",
        precision: "estimated",
        confidence: "low",
        tags: { fallback: true, fallbackReason: "dumpsys meminfo unavailable" }
      })
    ]
  };
}

describe("Android report diagnostics", () => {
  it("adds sanitized diagnostics, notices, and network summary to JSON and HTML", () => {
    const report = new ReportGenerator().generate(input(), { includeRawMetricsInHtml: true });
    const json = JSON.parse(report.json) as {
      androidDiagnostics?: {
        networkPrecisionNotice?: string;
        fallbackNotices: string[];
        diagnosticsTimeline: DiagnosticRecord[];
      };
    };

    expect(report.summary.networkRxMb).toBeCloseTo(1024 / 1024 / 1024, 6);
    expect(json.androidDiagnostics?.networkPrecisionNotice).toContain("not target-only");
    expect(json.androidDiagnostics?.fallbackNotices.join(" ")).toContain("/proc/<pid>/status");
    expect(JSON.stringify(json)).not.toContain("ZX1G22ABCDEF");
    expect(report.html).toContain("Android Diagnostics");
    expect(report.html).toContain("Device-level network counters may include traffic from other apps.");
    expect(report.html).toContain("Android FPS probe is experimental.");
    expect(report.html).toContain("does not include logcat or bugreport output by default");
    expect(report.html).not.toContain("bugreport output</pre>");
  });
});
