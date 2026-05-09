import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Device,
  MetricAvailability,
  MetricEvent,
  MetricCollector,
  Session,
  SessionConfig,
  Target,
  ToolStatus
} from "@lumatrace/core";
import { CollectorError } from "@lumatrace/core";
import type { IosXctraceCaptureOptions, IosXctraceCaptureResult } from "@lumatrace/collectors-ios";
import { LumaTraceDatabase } from "@lumatrace/storage";
import { createServer } from "../src/server";

class FakeIosCollector implements MetricCollector {
  readonly id = "ios-xcrun";
  readonly platform = "ios" as const;

  async getToolStatus(): Promise<ToolStatus> {
    return {
      toolName: "xcrun",
      status: "available",
      version: "70",
      reason: "Fake xcrun is available for iOS Foundation tests."
    };
  }

  async discoverDevices(): Promise<Device[]> {
    return [
      {
        id: "ios-simulator:abc123",
        platform: "ios",
        name: "iPhone 15 Pro",
        osVersion: "17.4",
        connectionType: "local",
        capabilities: await this.getCapabilities(),
        tags: {
          source: "fake-ios",
          isSimulator: true,
          maskedUdid: "E2E4...9ABC"
        }
      }
    ];
  }

  async listTargets(): Promise<Target[]> {
    return [
      {
        id: "ios-app:ios-simulator:abc123:com.example.game",
        name: "Example Game",
        type: "app",
        platform: "ios",
        bundleId: "com.example.game",
        tags: {
          source: "fake-ios"
        }
      }
    ];
  }

  async getCapabilities(): Promise<MetricAvailability[]> {
    return [
      {
        metricName: "ios.device_discovery",
        platform: "ios",
        status: "available",
        source: "xcrun:xctrace list devices"
      },
      {
        metricName: "fps",
        platform: "ios",
        status: "requires_manual_trace",
        source: "xctrace:planned"
      }
    ];
  }

  async startSession(config: SessionConfig): Promise<Session> {
    throw new CollectorError("iOS Foundation does not implement metric sessions.", "IOS_SESSION_REQUIRES_MANUAL_TRACE", {
      collectorId: this.id,
      deviceId: config.deviceId,
      targetId: config.targetId
    });
  }

  async captureXctrace(options: Omit<IosXctraceCaptureOptions, "udid">): Promise<IosXctraceCaptureResult> {
    const metrics: MetricEvent[] =
      options.target?.bundleId === "com.example.game"
        ? [
            {
              sessionId: options.sessionId,
              timestampMs: options.importedAtMs ?? 1_700_000_000_000,
              sequence: 0,
              deviceId: options.deviceId,
              targetId: options.targetId,
              metricName: "fps",
              value: 60,
              unit: "fps",
              source: "ios:xctrace-csv-import",
              precision: "estimated",
              confidence: "high",
              tags: {
                manualTrace: false,
                automaticXctrace: true,
                experimental: true
              }
            },
            {
              sessionId: options.sessionId,
              timestampMs: (options.importedAtMs ?? 1_700_000_000_000) + 1,
              sequence: 1,
              deviceId: options.deviceId,
              targetId: options.targetId,
              metricName: "frame_time_ms",
              value: 16.67,
              unit: "ms",
              source: "ios:xctrace-csv-import",
              precision: "estimated",
              confidence: "high",
              tags: {
                manualTrace: false,
                automaticXctrace: true,
                experimental: true
              }
            }
          ]
        : [];
    return {
      status: metrics.length > 0 ? "success" : "no_data",
      metrics,
      rawRowCount: metrics.length > 0 ? 1 : 0,
      matchedRowCount: metrics.length > 0 ? 1 : 0,
      metricCount: metrics.length,
      matchStatus: metrics.length > 0 ? "matched" : "no_match",
      matchConfidence: metrics.length > 0 ? "high" : "none",
      reason: metrics.length > 0 ? "fake xctrace capture mapped metrics" : "no target rows",
      warnings: [],
      diagnostics: {
        iosCode: metrics.length > 0 ? "IOS_XCTRACE_CAPTURE_COMPLETED" : "IOS_XCTRACE_CAPTURE_NO_DATA"
      }
    };
  }

  async pauseSession(): Promise<void> {
    throw new CollectorError("iOS session does not exist.", "SESSION_NOT_FOUND", { collectorId: this.id });
  }

  async stopSession(): Promise<void> {
    throw new CollectorError("iOS session does not exist.", "SESSION_NOT_FOUND", { collectorId: this.id });
  }

  streamMetrics(): AsyncIterable<MetricEvent> {
    throw new CollectorError("iOS session does not exist.", "SESSION_NOT_FOUND", { collectorId: this.id });
  }
}

describe("local-server iOS collector integration", () => {
  it("registers iOS devices, targets, capabilities, and xcrun tool status", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      iosCollector: new FakeIosCollector()
    });
    try {
      const devices = (await app.inject({ method: "GET", url: "/api/devices" })).json() as {
        ok: true;
        data: Device[];
      };
      expect(devices.data.some((device) => device.id === "ios-simulator:abc123")).toBe(true);

      const targets = (await app.inject({ method: "GET", url: "/api/devices/ios-simulator%3Aabc123/targets" })).json() as {
        ok: true;
        data: Target[];
      };
      expect(targets.data[0]?.bundleId).toBe("com.example.game");

      const capabilities = (await app.inject({ method: "GET", url: "/api/capabilities?platform=ios" })).json() as {
        ok: true;
        data: MetricAvailability[];
      };
      expect(capabilities.data.some((capability) => capability.metricName === "fps" && capability.status === "requires_manual_trace")).toBe(true);

      const tools = (await app.inject({ method: "GET", url: "/api/tools/status" })).json() as {
        ok: true;
        data: ToolStatus[];
      };
      expect(tools.data.some((tool) => tool.toolName === "xcrun" && tool.status === "available")).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("imports manual xctrace CSV metrics into storage, diagnostics, and report", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      iosCollector: new FakeIosCollector()
    });
    try {
      const devices = (await app.inject({ method: "GET", url: "/api/devices" })).json() as {
        ok: true;
        data: Device[];
      };
      const device = devices.data.find((item) => item.id === "ios-simulator:abc123");
      expect(device).toBeDefined();

      const targets = (await app.inject({ method: "GET", url: "/api/devices/ios-simulator%3Aabc123/targets" })).json() as {
        ok: true;
        data: Target[];
      };
      const target = targets.data[0];
      expect(target).toBeDefined();

      const created = await app.inject({
        method: "POST",
        url: "/api/sessions",
        payload: {
          name: "iOS trace import",
          deviceId: device?.id,
          targetId: target?.id,
          sampleIntervalMs: 1000
        }
      });
      expect(created.statusCode).toBe(200);
      const session = created.json() as { ok: true; data: Session };

      const csvText = readFileSync(resolve("../../tests/fixtures/ios/xctrace_csv_sample.csv"), "utf8");
      const imported = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.data.id}/ios/trace-import`,
        payload: {
          csvText,
          target: {
            bundleId: "com.example.game"
          },
          traceStartedAtMs: 1_700_000_000_000,
          captureId: "ios-import-test"
        }
      });
      expect(imported.statusCode).toBe(200);
      const importPayload = imported.json() as {
        ok: true;
        data: { status: string; rawRowCount: number; matchedRowCount: number; metricCount: number };
      };
      expect(importPayload.data).toMatchObject({
        status: "success",
        rawRowCount: 3,
        matchedRowCount: 2
      });
      expect(importPayload.data.metricCount).toBeGreaterThan(0);

      const metrics = (await app.inject({
        method: "GET",
        url: `/api/sessions/${session.data.id}/metrics?metricNames=fps,frame_time_ms,cpu_percent,memory_mb`
      })).json() as { ok: true; data: MetricEvent[] };
      expect(metrics.data.some((metric) => metric.source === "ios:xctrace-csv-import")).toBe(true);
      expect(metrics.data.every((metric) => metric.tags?.manualTrace === true)).toBe(true);

      const diagnostics = (await app.inject({
        method: "GET",
        url: `/api/sessions/${session.data.id}/diagnostics`
      })).json() as { ok: true; data: Array<{ category: string; details?: Record<string, unknown> }> };
      expect(diagnostics.data.some((diagnostic) => diagnostic.category === "ios:trace_import")).toBe(true);
      expect(JSON.stringify(diagnostics.data)).not.toContain("Time (s),Process");

      const report = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.data.id}/export?format=json`
      });
      expect(report.statusCode).toBe(200);
      const reportJson = JSON.parse(report.payload) as {
        summary: { avgFps?: number; p95FrameTimeMs?: number };
        iosDiagnostics?: unknown;
      };
      expect(reportJson.summary.avgFps).toBeGreaterThan(0);
      expect(reportJson.summary.p95FrameTimeMs).toBeGreaterThan(0);
      expect(reportJson.iosDiagnostics).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it("runs automatic xctrace capture into storage, diagnostics, and report", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      iosCollector: new FakeIosCollector()
    });
    try {
      const devices = (await app.inject({ method: "GET", url: "/api/devices" })).json() as {
        ok: true;
        data: Device[];
      };
      const device = devices.data.find((item) => item.id === "ios-simulator:abc123");
      expect(device).toBeDefined();
      const targets = (await app.inject({ method: "GET", url: "/api/devices/ios-simulator%3Aabc123/targets" })).json() as {
        ok: true;
        data: Target[];
      };
      const target = targets.data[0];
      expect(target).toBeDefined();
      const created = await app.inject({
        method: "POST",
        url: "/api/sessions",
        payload: {
          name: "iOS automatic xctrace",
          deviceId: device?.id,
          targetId: target?.id,
          sampleIntervalMs: 1000
        }
      });
      const session = created.json() as { ok: true; data: Session };

      const capture = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.data.id}/ios/xctrace-capture`,
        payload: {
          target: {
            bundleId: "com.example.game"
          },
          durationMs: 1000,
          exportXPath: "/trace-toc/run/data/table"
        }
      });
      expect(capture.statusCode).toBe(200);
      const payload = capture.json() as {
        ok: true;
        data: { status: string; metricCount: number; diagnosticsId: string };
      };
      expect(payload.data.status).toBe("success");
      expect(payload.data.metricCount).toBe(2);

      const metrics = (await app.inject({
        method: "GET",
        url: `/api/sessions/${session.data.id}/metrics?metricNames=fps,frame_time_ms`
      })).json() as { ok: true; data: MetricEvent[] };
      expect(metrics.data.map((metric) => metric.metricName).sort()).toEqual(["fps", "frame_time_ms"]);

      const diagnostics = (await app.inject({
        method: "GET",
        url: `/api/sessions/${session.data.id}/diagnostics`
      })).json() as { ok: true; data: Array<{ category: string; details?: Record<string, unknown> }> };
      expect(diagnostics.data.some((diagnostic) => diagnostic.category === "ios:xctrace_capture")).toBe(true);
      expect(JSON.stringify(diagnostics.data)).not.toContain("token=");

      const report = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.data.id}/export?format=json`
      });
      const reportJson = JSON.parse(report.payload) as { summary: { avgFps?: number; p95FrameTimeMs?: number } };
      expect(reportJson.summary.avgFps).toBe(60);
      expect(reportJson.summary.p95FrameTimeMs).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
