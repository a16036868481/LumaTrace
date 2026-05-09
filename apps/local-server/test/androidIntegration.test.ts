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

class FakeAndroidCollector implements MetricCollector {
  readonly id = "android-adb";
  readonly platform = "android" as const;

  async getToolStatus(): Promise<ToolStatus> {
    return {
      toolName: "adb",
      status: "available",
      version: "test-adb",
      reason: "Fake adb for local-server integration tests."
    };
  }

  async discoverDevices(): Promise<Device[]> {
    return [
      {
        id: "android:test-device",
        platform: "android",
        name: "Android Test Device",
        osVersion: "Android 14 (SDK 34)",
        connectionType: "usb",
        capabilities: await this.getCapabilities(),
        tags: {
          source: "adb",
          adbState: "device"
        }
      }
    ];
  }

  async listTargets(): Promise<Target[]> {
    return [
      {
        id: "android-package:com.example.app",
        name: "com.example.app",
        type: "app",
        platform: "android",
        packageName: "com.example.app",
        tags: {
          source: "adb"
        }
      }
    ];
  }

  async getCapabilities(): Promise<MetricAvailability[]> {
    return [
      {
        metricName: "android.device_discovery",
        platform: "android",
        status: "available",
        reason: "Fake Android collector.",
        source: "adb"
      },
      {
        metricName: "fps",
        platform: "android",
        status: "experimental",
        reason: "Experimental gfxinfo/SurfaceFlinger FPS probe; no target FPS is emitted when layer matching fails.",
        source: "adb:dumpsys gfxinfo framestats"
      }
    ];
  }

  async startSession(config: SessionConfig): Promise<Session> {
    void config;
    throw new Error("Android metrics streaming is not implemented in Milestone 2A.");
  }

  async pauseSession(): Promise<void> {
    throw new Error("Not implemented.");
  }

  async stopSession(sessionId: string): Promise<void> {
    void sessionId;
    throw new Error("Not implemented.");
  }

  streamMetrics(sessionId: string): AsyncIterable<MetricEvent> {
    void sessionId;
    throw new Error("Not implemented.");
  }
}

class FailingAndroidCollector extends FakeAndroidCollector {
  override async getToolStatus(): Promise<ToolStatus> {
    return {
      toolName: "adb",
      status: "missing",
      reason: "Fake adb is missing.",
      suggestedAction: "Install Android SDK Platform Tools."
    };
  }

  override async discoverDevices(): Promise<Device[]> {
    throw new Error("adb missing");
  }
}

class StreamingAndroidCollector extends FakeAndroidCollector {
  private readonly running = new Map<string, Session>();
  private sequence = 0;

  override async getCapabilities(): Promise<MetricAvailability[]> {
    return [
      ...(await super.getCapabilities()),
      {
        metricName: "cpu_percent",
        platform: "android",
        status: "available",
        reason: "Fake Android 2B sampler.",
        source: "adb"
      },
      {
        metricName: "memory_mb",
        platform: "android",
        status: "available",
        reason: "Fake Android 2B sampler.",
        source: "adb"
      },
      {
        metricName: "battery_level_percent",
        platform: "android",
        status: "available",
        reason: "Fake Android sampler.",
        source: "adb"
      },
      {
        metricName: "network_rx_bytes",
        platform: "android",
        status: "available",
        reason: "Fake Android network sampler.",
        source: "adb"
      },
      {
        metricName: "network_tx_bytes",
        platform: "android",
        status: "available",
        reason: "Fake Android network sampler.",
        source: "adb"
      }
    ];
  }

  override async startSession(config: SessionConfig): Promise<Session> {
    const session: Session = {
      id: config.id ?? "android-stream-session",
      name: config.name,
      deviceId: config.deviceId,
      targetId: config.targetId,
      startedAt: Date.now(),
      sampleIntervalMs: config.sampleIntervalMs,
      status: "running",
      config: {
        platform: "android",
        enableExperimentalFps: config.options?.enableExperimentalFps === true
      }
    };
    this.running.set(session.id, session);
    return session;
  }

  override async stopSession(sessionId: string): Promise<void> {
    this.running.delete(sessionId);
  }

  override async *streamMetrics(sessionId: string): AsyncIterable<MetricEvent> {
    while (this.running.has(sessionId)) {
      const session = this.running.get(sessionId)!;
      const base = {
        sessionId,
        timestampMs: Date.now(),
        monotonicMs: this.sequence,
        deviceId: session.deviceId,
        targetId: session.targetId,
        source: "adb:test",
        precision: "estimated" as const,
        confidence: "medium" as const,
        tags: {
          platform: "android",
          pid: 12345
        }
      };
      yield {
        ...base,
        sequence: ++this.sequence,
        metricName: "cpu_percent",
        value: 24,
        unit: METRIC_UNITS.PERCENT
      };
      yield {
        ...base,
        sequence: ++this.sequence,
        metricName: "memory_mb",
        value: 512,
        unit: METRIC_UNITS.MEGABYTES
      };
      yield {
        ...base,
        sequence: ++this.sequence,
        metricName: "battery_level_percent",
        value: 85,
        unit: METRIC_UNITS.PERCENT
      };
      yield {
        ...base,
        sequence: ++this.sequence,
        metricName: "network_rx_bytes",
        value: 1024,
        unit: METRIC_UNITS.BYTES,
        precision: "device_level",
        tags: {
          ...base.tags,
          scope: "device",
          intervalMs: 1000
        }
      };
      yield {
        ...base,
        sequence: ++this.sequence,
        metricName: "network_tx_bytes",
        value: 512,
        unit: METRIC_UNITS.BYTES,
        precision: "device_level",
        tags: {
          ...base.tags,
          scope: "device",
          intervalMs: 1000
        }
      };
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
}

class FpsProbeFailingAndroidCollector extends StreamingAndroidCollector {
  private readonly fpsEnabledSessions = new Set<string>();

  override async startSession(config: SessionConfig): Promise<Session> {
    const session = await super.startSession(config);
    if (config.options?.enableExperimentalFps === true) {
      this.fpsEnabledSessions.add(session.id);
    }
    return session;
  }

  override async stopSession(sessionId: string): Promise<void> {
    await super.stopSession(sessionId);
    if (this.fpsEnabledSessions.has(sessionId)) {
      throw new Error("Experimental FPS probe failed: layer matching was ambiguous.");
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

describe("local-server Android collector integration", () => {
  it("serves Android capabilities, adb tool status, devices, and targets with a fake collector", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      androidCollector: new FakeAndroidCollector()
    });
    try {
      const tools = await app.inject({ method: "GET", url: "/api/tools/status" });
      expect(tools.json()).toMatchObject({
        ok: true,
        data: expect.arrayContaining([expect.objectContaining({ toolName: "adb", status: "available" })])
      });

      const capabilities = await app.inject({ method: "GET", url: "/api/capabilities?platform=android" });
      expect(capabilities.json()).toMatchObject({
        ok: true,
        data: expect.arrayContaining([
          expect.objectContaining({ metricName: "android.device_discovery", status: "available" })
        ])
      });

      const devices = await app.inject({ method: "GET", url: "/api/devices" });
      const deviceData = devices.json() as { ok: true; data: Device[] };
      expect(deviceData.data.some((device) => device.id === "mock-local-device-1")).toBe(true);
      expect(deviceData.data.some((device) => device.id === "android:test-device")).toBe(true);

      const targets = await app.inject({
        method: "GET",
        url: "/api/devices/android%3Atest-device/targets"
      });
      expect(targets.json()).toMatchObject({
        ok: true,
        data: [expect.objectContaining({ packageName: "com.example.app" })]
      });
    } finally {
      await app.close();
    }
  });

  it("keeps mock devices available when Android discovery fails", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      androidCollector: new FailingAndroidCollector()
    });
    try {
      const devices = await app.inject({ method: "GET", url: "/api/devices" });
      expect(devices.json()).toMatchObject({
        ok: true,
        data: expect.arrayContaining([expect.objectContaining({ id: "mock-local-device-1" })])
      });
      const tools = await app.inject({ method: "GET", url: "/api/tools/status" });
      expect(tools.json()).toMatchObject({
        ok: true,
        data: expect.arrayContaining([expect.objectContaining({ toolName: "adb", status: "missing" })])
      });
    } finally {
      await app.close();
    }
  });

  it("streams, stores, and reports Android 2B metrics from a fake Android collector", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      androidCollector: new StreamingAndroidCollector(),
      metricBatchSize: 3,
      metricFlushIntervalMs: 10
    });
    try {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address() as AddressInfo;

      await app.inject({ method: "GET", url: "/api/devices" });
      await app.inject({ method: "GET", url: "/api/devices/android%3Atest-device/targets" });
      const created = (
        await app.inject({
          method: "POST",
          url: "/api/sessions",
          payload: {
            name: "Android stream",
            deviceId: "android:test-device",
            targetId: "android-package:com.example.app",
            sampleIntervalMs: 1
          }
        })
      ).json() as { ok: true; data: Session };
      await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/start` });

      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/api/sessions/${created.data.id}/stream`
      );
      await waitForMessage(
        socket,
        (message) =>
          (message as { type?: string; data?: MetricEvent }).type === "metric" &&
          (message as { data?: MetricEvent }).data?.metricName === "cpu_percent"
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      const metrics = (
        await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/metrics` })
      ).json() as { ok: true; data: MetricEvent[] };
      expect(metrics.data.some((metric) => metric.metricName === "cpu_percent")).toBe(true);
      expect(metrics.data.some((metric) => metric.metricName === "memory_mb")).toBe(true);
      expect(metrics.data.some((metric) => metric.metricName === "network_rx_bytes")).toBe(true);
      expect(metrics.data.find((metric) => metric.metricName === "network_rx_bytes")?.precision).toBe("device_level");

      await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/stop` });
      socket.close();
      const report = (
        await app.inject({ method: "GET", url: `/api/sessions/${created.data.id}/report` })
      ).json() as {
        ok: true;
        data: {
          summary: {
            avgCpuPercent?: number;
            avgMemoryMb?: number;
            avgFps?: number;
            networkRxMb?: number;
            networkTxMb?: number;
          };
        };
      };
      expect(report.data.summary.avgCpuPercent).toBeGreaterThan(0);
      expect(report.data.summary.avgMemoryMb).toBeGreaterThan(0);
      expect(report.data.summary.networkRxMb).toBeGreaterThan(0);
      expect(report.data.summary.networkTxMb).toBeGreaterThan(0);
      expect(report.data.summary.avgFps).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("keeps Android sessions stoppable when an experimental FPS probe fails", async () => {
    const app = await createServer({
      database: new LumaTraceDatabase({ dbPath: ":memory:" }),
      enableLogger: false,
      androidCollector: new FpsProbeFailingAndroidCollector(),
      metricBatchSize: 3,
      metricFlushIntervalMs: 10
    });
    try {
      await app.inject({ method: "GET", url: "/api/devices" });
      await app.inject({ method: "GET", url: "/api/devices/android%3Atest-device/targets" });
      const created = (
        await app.inject({
          method: "POST",
          url: "/api/sessions",
          payload: {
            name: "Android FPS probe",
            deviceId: "android:test-device",
            targetId: "android-package:com.example.app",
            sampleIntervalMs: 1,
            config: {
              enableExperimentalFps: true
            }
          }
        })
      ).json() as { ok: true; data: Session };
      await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/start` });
      const stopped = await app.inject({ method: "POST", url: `/api/sessions/${created.data.id}/stop` });

      expect(stopped.json()).toMatchObject({
        ok: true,
        data: {
          status: "stopped"
        }
      });
      const diagnostics = await app.inject({ method: "GET", url: "/api/diagnostics?level=warn" });
      expect(diagnostics.json()).toMatchObject({
        ok: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            message: "Collector stop failed."
          })
        ])
      });
    } finally {
      await app.close();
    }
  });
});
