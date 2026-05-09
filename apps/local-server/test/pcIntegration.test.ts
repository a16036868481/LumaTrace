import { describe, expect, it } from "vitest";
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
import { METRIC_UNITS } from "@lumatrace/core";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { LumaTraceDatabase } from "@lumatrace/storage";
import { createServer } from "../src/server";

class FakePcCollector implements MetricCollector {
  readonly id = "pc-local";
  readonly platform = "windows" as const;
  private readonly running = new Map<string, Session>();
  private sequence = 0;

  constructor(private readonly presentMonStatus: ToolStatus["status"] = "missing") {}

  listDiagnostics(): [] {
    return [];
  }

  summarizeDiagnostics() {
    return {
      total: 0,
      byLevel: {},
      byCategory: {},
      byCode: {},
      warnings: 0,
      errors: 0,
      importantEvents: []
    };
  }

  async getPresentMonStatus(): Promise<Record<string, unknown>> {
    return {
      toolStatus: await this.getToolStatus(),
      compatibility: {
        version: this.presentMonStatus === "available" ? "2.2.0" : undefined,
        supportsOutputFile: this.presentMonStatus === "available",
        supportsTimedCapture: this.presentMonStatus === "available",
        supportsProcessIdFilter: this.presentMonStatus === "available",
        supportsProcessNameFilter: this.presentMonStatus === "available",
        supportsTerminateAfterTimer: this.presentMonStatus === "available",
        warnings: [],
        recommendedArgsStyle: "long"
      }
    };
  }

  getPresentMonCaptureStatus(sessionId: string): Record<string, unknown> {
    const session = this.running.get(sessionId);
    return {
      status: session?.config?.enablePresentMonCapture === true ? "completed" : "idle",
      updatedAt: Date.now(),
      rawRowCount: session?.config?.enablePresentMonCapture === true ? 2 : 0,
      matchedRowCount: session?.config?.enablePresentMonCapture === true ? 2 : 0,
      metricCount: session?.config?.enablePresentMonCapture === true ? 2 : 0,
      warnings: [],
      diagnostics: []
    };
  }

  async getToolStatus(): Promise<ToolStatus> {
    return {
      toolName: "PresentMon",
      status: this.presentMonStatus,
      reason:
        this.presentMonStatus === "available"
          ? "Fake PresentMon is available for explicit capture."
          : "Fake PresentMon is missing; CPU and memory remain available."
    };
  }

  async discoverDevices(): Promise<Device[]> {
    return [
      {
        id: "pc-local:windows",
        platform: "windows",
        name: "Local PC",
        connectionType: "local",
        capabilities: await this.getCapabilities(),
        tags: {
          source: "fake-pc"
        }
      }
    ];
  }

  async listTargets(): Promise<Target[]> {
    return [
      {
        id: "pc-windows-process:4321:4321-100",
        name: "Game.exe",
        type: "process",
        platform: "windows",
        pid: 4321,
        executablePath: "C:\\Users\\player\\Games\\Game.exe",
        tags: {
          runtimeId: "4321-100",
          processName: "Game.exe",
          source: "fake-pc"
        }
      }
    ];
  }

  async getCapabilities(): Promise<MetricAvailability[]> {
    return [
      {
        metricName: "pc.device_discovery",
        platform: "windows",
        status: "available",
        source: "node:os"
      },
      {
        metricName: "cpu_percent",
        platform: "windows",
        status: "available",
        source: "windows:process-times"
      },
      {
        metricName: "memory_mb",
        platform: "windows",
        status: "available",
        source: "windows:process-memory"
      },
      {
        metricName: "fps",
        platform: "windows",
        status: this.presentMonStatus === "available" ? "experimental" : "requires_tool",
        reason:
          this.presentMonStatus === "available"
            ? "PresentMon explicit capture is experimental."
            : "PresentMon required.",
        source: "PresentMon"
      }
    ];
  }

  async startSession(config: SessionConfig): Promise<Session> {
    const session: Session = {
      id: config.id ?? "pc-stream-session",
      name: config.name,
      deviceId: config.deviceId,
      targetId: config.targetId,
      startedAt: Date.now(),
      sampleIntervalMs: config.sampleIntervalMs,
      status: "running",
      config: {
        platform: "windows",
        pid: 4321,
        ...(config.options ?? {})
      }
    };
    this.running.set(session.id, session);
    return session;
  }

  async pauseSession(): Promise<void> {
    // Not needed for this integration test.
  }

  async stopSession(sessionId: string): Promise<void> {
    this.running.delete(sessionId);
  }

  async *streamMetrics(sessionId: string): AsyncIterable<MetricEvent> {
    while (this.running.has(sessionId)) {
      const session = this.running.get(sessionId)!;
      const base = {
        sessionId,
        timestampMs: Date.now(),
        monotonicMs: this.sequence,
        deviceId: session.deviceId,
        targetId: session.targetId,
        source: "windows:test",
        precision: "estimated" as const,
        confidence: "medium" as const,
        tags: {
          platform: "windows",
          pid: 4321,
          processName: "Game.exe"
        }
      };
      yield {
        ...base,
        sequence: ++this.sequence,
        metricName: "cpu_percent",
        value: 15,
        unit: METRIC_UNITS.PERCENT
      };
      yield {
        ...base,
        sequence: ++this.sequence,
        metricName: "memory_mb",
        value: 256,
        unit: METRIC_UNITS.MEGABYTES
      };
      if (session.config?.enablePresentMonCapture === true && this.sequence < 6) {
        yield {
          ...base,
          source: "PresentMon:CSV",
          confidence: "high" as const,
          sequence: ++this.sequence,
          metricName: "frame_time_ms",
          value: 16.67,
          unit: METRIC_UNITS.MILLISECONDS,
          tags: {
            ...base.tags,
            sampler: "presentmon",
            captureId: "fake-presentmon",
            experimental: true
          }
        };
        yield {
          ...base,
          source: "PresentMon:CSV",
          confidence: "high" as const,
          sequence: ++this.sequence,
          metricName: "fps",
          value: 60,
          unit: METRIC_UNITS.FPS,
          tags: {
            ...base.tags,
            sampler: "presentmon",
            captureId: "fake-presentmon",
            experimental: true
          }
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
}

function waitForMessage(socket: WebSocket, predicate: (message: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for websocket message."));
    }, 1000);
    const onMessage = (data: WebSocket.RawData): void => {
      const parsed = JSON.parse(data.toString()) as unknown;
      if (predicate(parsed)) {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        resolve(parsed);
      }
    };
    socket.on("message", onMessage);
  });
}

describe("local-server PC collector integration", () => {
  it("serves PC devices, streams CPU/memory, stores metrics, and reports without FPS", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      pcCollector: new FakePcCollector(),
      metricBatchSize: 2,
      metricFlushIntervalMs: 10
    });
    try {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address() as AddressInfo;
      const devices = (await app.inject({ method: "GET", url: "/api/devices" })).json() as {
        ok: true;
        data: Device[];
      };
      expect(devices.data.some((device) => device.id === "pc-local:windows")).toBe(true);
      const tools = (await app.inject({ method: "GET", url: "/api/tools/status" })).json() as {
        ok: true;
        data: ToolStatus[];
      };
      expect(tools.data.some((tool) => tool.toolName === "PresentMon" && tool.status === "missing")).toBe(true);
      const presentMonStatus = (
        await app.inject({ method: "GET", url: "/api/pc/pc-local%3Awindows/presentmon/status" })
      ).json() as { ok: true; data: { toolStatus: ToolStatus } };
      expect(presentMonStatus.data.toolStatus.status).toBe("missing");
      const targets = (await app.inject({ method: "GET", url: "/api/devices/pc-local%3Awindows/targets" })).json() as {
        ok: true;
        data: Target[];
      };
      expect(targets.data[0]?.pid).toBe(4321);
      const created = (
        await app.inject({
          method: "POST",
          url: "/api/sessions",
          payload: {
            name: "PC stream",
            deviceId: "pc-local:windows",
            targetId: targets.data[0]!.id,
            sampleIntervalMs: 1
          }
        })
      ).json() as { ok: true; data: Session };
      await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/start` });
      const initialCaptureStatus = (
        await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/presentmon/status` })
      ).json() as { ok: true; data: { status: string } };
      expect(initialCaptureStatus.data.status).toBe("idle");
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/sessions/${created.data.id}/stream`);
      await waitForMessage(
        socket,
        (message) =>
          (message as { type?: string; data?: MetricEvent }).type === "metric" &&
          (message as { data?: MetricEvent }).data?.metricName === "cpu_percent"
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      const metrics = (await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/metrics` })).json() as {
        ok: true;
        data: MetricEvent[];
      };
      expect(metrics.data.some((metric) => metric.metricName === "cpu_percent")).toBe(true);
      expect(metrics.data.some((metric) => metric.metricName === "memory_mb")).toBe(true);
      await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/stop` });
      socket.close();
      const report = (await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/report` })).json() as {
        ok: true;
        data: {
          summary: {
            avgCpuPercent?: number;
            avgMemoryMb?: number;
            avgFps?: number;
          };
        };
      };
      expect(report.data.summary.avgCpuPercent).toBeGreaterThan(0);
      expect(report.data.summary.avgMemoryMb).toBeGreaterThan(0);
      expect(report.data.summary.avgFps).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("passes enablePresentMonCapture through and reports FPS/frame time from fake PresentMon metrics", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      pcCollector: new FakePcCollector("available"),
      metricBatchSize: 2,
      metricFlushIntervalMs: 10
    });
    try {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address() as AddressInfo;
      const targets = (await app.inject({ method: "GET", url: "/api/devices/pc-local%3Awindows/targets" })).json() as {
        ok: true;
        data: Target[];
      };
      const created = (
        await app.inject({
          method: "POST",
          url: "/api/sessions",
          payload: {
            name: "PC PresentMon",
            deviceId: "pc-local:windows",
            targetId: targets.data[0]!.id,
            sampleIntervalMs: 1,
            config: {
              enablePresentMonCapture: true,
              presentMonCaptureDurationMs: 1000,
              presentMonTargetMode: "pid"
            }
          }
        })
      ).json() as { ok: true; data: Session };
      await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/start` });
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/sessions/${created.data.id}/stream`);
      await waitForMessage(
        socket,
        (message) =>
          (message as { type?: string; data?: MetricEvent }).type === "metric" &&
          (message as { data?: MetricEvent }).data?.metricName === "fps"
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      const captureStatus = (
        await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/presentmon/status` })
      ).json() as { ok: true; data: { status: string; matchedRowCount?: number } };
      expect(captureStatus.data.status).toBe("completed");
      expect(captureStatus.data.matchedRowCount).toBe(2);
      await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/stop` });
      socket.close();
      const metrics = (await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/metrics` })).json() as {
        ok: true;
        data: MetricEvent[];
      };
      expect(metrics.data.some((metric) => metric.source === "PresentMon:CSV")).toBe(true);
      const report = (await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/report` })).json() as {
        ok: true;
        data: { summary: { avgFps?: number; p95FrameTimeMs?: number } };
      };
      expect(report.data.summary.avgFps).toBe(60);
      expect(report.data.summary.p95FrameTimeMs).toBe(16.67);
    } finally {
      await app.close();
    }
  });
});
