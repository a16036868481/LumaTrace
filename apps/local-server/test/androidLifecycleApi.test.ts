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
import { LumaTraceDatabase } from "@lumatrace/storage";
import type { AndroidAppStartOptions, AndroidAppStopOptions } from "@lumatrace/collectors-android";
import type { AndroidDiagnosticEvent, AndroidDiagnosticsListOptions } from "@lumatrace/collectors-android";
import { createServer } from "../src/server";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

function parsePayload<T>(payload: string): ApiSuccess<T> {
  return JSON.parse(payload) as ApiSuccess<T>;
}

class FakeAndroidLifecycleCollector implements MetricCollector {
  readonly id = "fake-android";
  readonly platform = "android" as const;
  readonly startCalls: AndroidAppStartOptions[] = [];
  readonly stopCalls: AndroidAppStopOptions[] = [];
  readonly diagnostics: AndroidDiagnosticEvent[] = [
    {
      id: "android-diag-api",
      timestampMs: 1000,
      sessionId: "session-api",
      deviceId: "android:fake",
      level: "warn",
      category: "network",
      code: "NETWORK_FALLBACK_DEVICE_LEVEL",
      message: "Device-level network fallback.",
      details: { serial: "<device-serial>" }
    }
  ];

  async getToolStatus(): Promise<ToolStatus> {
    return { toolName: "adb", status: "available", reason: "fake adb" };
  }

  async discoverDevices(): Promise<Device[]> {
    return [
      {
        id: "android:fake",
        platform: "android",
        name: "Fake Android",
        connectionType: "usb",
        capabilities: []
      }
    ];
  }

  async listTargets(): Promise<Target[]> {
    return [
      {
        id: "android-package:com.example.app",
        name: "com.example.app",
        platform: "android",
        type: "app",
        packageName: "com.example.app",
        tags: {
          launcherComponent: "com.example.app/.MainActivity",
          hasLauncher: true
        }
      }
    ];
  }

  async getCapabilities(): Promise<MetricAvailability[]> {
    return [
      {
        metricName: "android.app_start",
        platform: "android",
        status: "available",
        reason: "fake",
        source: "adb"
      }
    ];
  }

  async startSession(config: SessionConfig): Promise<Session> {
    return {
      id: config.id ?? "fake-session",
      name: config.name,
      deviceId: config.deviceId,
      targetId: config.targetId,
      sampleIntervalMs: config.sampleIntervalMs,
      status: "running"
    };
  }

  async pauseSession(): Promise<void> {}

  async stopSession(): Promise<void> {}

  async *streamMetrics(): AsyncIterable<MetricEvent> {}

  async startApp(_deviceId: string, _packageName: string, options: AndroidAppStartOptions = {}) {
    this.startCalls.push(options);
    return {
      ok: true,
      method: "am_start" as const,
      launcherComponent: options.launcherComponent,
      pid: 12345,
      durationMs: 1,
      warnings: [],
      diagnostics: ["started"]
    };
  }

  async stopApp(_deviceId: string, _packageName: string, options: AndroidAppStopOptions = {}) {
    this.stopCalls.push(options);
    return {
      ok: true,
      method: "am_force_stop" as const,
      durationMs: 1,
      stopped: true,
      warnings: [],
      diagnostics: ["stopped"]
    };
  }

  async getForegroundTarget(): Promise<Target> {
    return {
      id: "android-package:tv.danmaku.bili",
      name: "tv.danmaku.bili",
      platform: "android",
      type: "app",
      packageName: "tv.danmaku.bili",
      tags: {
        source: "adb_foreground_app",
        foregroundSource: "activity_top"
      }
    };
  }

  listDiagnostics(options: AndroidDiagnosticsListOptions = {}): AndroidDiagnosticEvent[] {
    return this.diagnostics.filter((event) => options.sessionId === undefined || event.sessionId === options.sessionId);
  }

  summarizeDiagnostics() {
    return {
      total: this.diagnostics.length,
      byLevel: { warn: this.diagnostics.length },
      byCategory: { network: this.diagnostics.length },
      byCode: { NETWORK_FALLBACK_DEVICE_LEVEL: this.diagnostics.length },
      warnings: this.diagnostics.length,
      errors: 0,
      importantEvents: this.diagnostics
    };
  }

  async getAndroidHealth(deviceId: string): Promise<Record<string, unknown>> {
    return {
      deviceId,
      adb: { status: "available", reason: "fake adb" },
      device: { state: "device", authorized: true },
      knownLimitations: ["No logcat or bugreport."]
    };
  }

  async getCacheStatus(deviceId?: string): Promise<Record<string, unknown>> {
    return { deviceId, launcher: [], deviceInfo: [] };
  }

  async refreshCache(deviceId: string): Promise<Record<string, unknown>> {
    return { deviceId, launcher: [], deviceInfo: [], refreshed: true };
  }
}

describe("local-server Android lifecycle API", () => {
  it("starts and stops Android apps through unified API responses", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const androidCollector = new FakeAndroidLifecycleCollector();
    const app = await createServer({
      database,
      enableLogger: false,
      androidCollector
    });

    try {
      const devices = await app.inject({ method: "GET", url: "/api/devices" });
      expect(devices.statusCode).toBe(200);
      const androidDevice = parsePayload<Array<{ id: string }>>(devices.payload).data.find((device) =>
        device.id.startsWith("android:")
      );
      expect(androidDevice?.id).toBe("android:fake");
      const androidDeviceId = androidDevice!.id;

      const targets = await app.inject({
        method: "GET",
        url: `/api/devices/${androidDeviceId}/targets`
      });
      expect(targets.statusCode).toBe(200);

      const session = parsePayload<Session>(
        (
          await app.inject({
            method: "POST",
            url: "/api/sessions",
            payload: {
              name: "Android diagnostics",
              deviceId: androidDeviceId,
              targetId: "android-package:com.example.app"
            }
          })
        ).payload
      ).data;
      androidCollector.diagnostics.push({
        id: "android-diag-session",
        timestampMs: 1100,
        sessionId: session.id,
        deviceId: androidDeviceId,
        level: "warn",
        category: "network",
        code: "NETWORK_FALLBACK_DEVICE_LEVEL",
        message: "Device-level network fallback."
      });

      const start = await app.inject({
        method: "POST",
        url: `/api/android/${androidDeviceId}/apps/com.example.app/start`,
        payload: {
          launcherComponent: "com.example.app/.MainActivity",
          allowMonkeyFallback: false
        }
      });
      expect(start.statusCode).toBe(200);
      expect(parsePayload<{ pid: number }>(start.payload).data.pid).toBe(12345);
      expect(androidCollector.startCalls[0]).toMatchObject({ allowMonkeyFallback: false });

      const stop = await app.inject({
        method: "POST",
        url: `/api/android/${androidDeviceId}/apps/com.example.app/stop`,
        payload: {
          waitUntilStopped: true
        }
      });
      expect(stop.statusCode).toBe(200);
      expect(parsePayload<{ stopped: boolean }>(stop.payload).data.stopped).toBe(true);
      expect(androidCollector.stopCalls[0]).toMatchObject({ waitUntilStopped: true });

      const health = await app.inject({ method: "GET", url: `/api/android/${androidDeviceId}/health` });
      expect(health.statusCode).toBe(200);
      expect(parsePayload<{ adb: { status: string } }>(health.payload).data.adb.status).toBe("available");

      const foreground = await app.inject({
        method: "GET",
        url: `/api/android/${androidDeviceId}/foreground-app`
      });
      expect(foreground.statusCode).toBe(200);
      expect(parsePayload<Target>(foreground.payload).data).toMatchObject({
        id: "android-package:tv.danmaku.bili",
        packageName: "tv.danmaku.bili",
        tags: expect.objectContaining({ source: "adb_foreground_app" })
      });

      const cache = await app.inject({ method: "POST", url: `/api/android/${androidDeviceId}/cache/refresh` });
      expect(cache.statusCode).toBe(200);

      const diagnostics = await app.inject({ method: "GET", url: `/api/sessions/${session.id}/diagnostics` });
      expect(diagnostics.statusCode).toBe(200);
      expect(parsePayload<unknown[]>(diagnostics.payload).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ category: "network" })])
      );

      const diagnosticsExport = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/diagnostics/export?format=json`
      });
      expect(diagnosticsExport.statusCode).toBe(200);
      expect(diagnosticsExport.payload).toContain("Device-level network fallback");
    } finally {
      await app.close();
    }
  });
});
