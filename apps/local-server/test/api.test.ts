import { describe, expect, it } from "vitest";
import type { Device, Session, Target } from "@lumatrace/core";
import {
  DeviceRepository,
  LumaTraceDatabase,
  MetricRepository,
  SessionRepository,
  TargetRepository
} from "@lumatrace/storage";
import { createServer } from "../src/server";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

function parsePayload<T>(payload: string): ApiSuccess<T> {
  return JSON.parse(payload) as ApiSuccess<T>;
}

async function waitForMetrics(app: Awaited<ReturnType<typeof createServer>>, sessionId: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1000) {
    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/metrics?limit=100`
    });
    const parsed = parsePayload<unknown[]>(response.payload);
    if (parsed.data.length > 0) {
      return parsed.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for persisted metrics.");
}

describe("local-server REST API", () => {
  it("runs the MVP-A session/report/export flow", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const app = await createServer({
      database,
      enableLogger: false,
      metricBatchSize: 4,
      metricFlushIntervalMs: 20
    });

    try {
      const health = await app.inject({ method: "GET", url: "/api/health" });
      expect(health.statusCode).toBe(200);
      expect(parsePayload<{ status: string }>(health.payload).data.status).toBe("ok");

      const devices = await app.inject({ method: "GET", url: "/api/devices" });
      expect(devices.statusCode).toBe(200);
      const device = parsePayload<Array<{ id: string }>>(devices.payload).data[0];
      expect(device?.id).toBe("mock-local-device-1");

      const targets = await app.inject({
        method: "GET",
        url: `/api/devices/${device?.id}/targets`
      });
      expect(targets.statusCode).toBe(200);
      const target = parsePayload<Array<{ id: string }>>(targets.payload).data[0];
      expect(target?.id).toBe("mock-game");

      const createSession = await app.inject({
        method: "POST",
        url: "/api/sessions",
        payload: {
          name: "API Test Session",
          deviceId: device?.id,
          targetId: target?.id,
          sampleIntervalMs: 1,
          config: {
            profileName: "stable_60fps"
          }
        }
      });
      expect(createSession.statusCode).toBe(200);
      const session = parsePayload<{ id: string; status: string }>(createSession.payload).data;
      expect(session.status).toBe("created");

      const sessionRead = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}`
      });
      expect(sessionRead.statusCode).toBe(200);
      expect(parsePayload<{ id: string }>(sessionRead.payload).data.id).toBe(session.id);

      const sessionList = await app.inject({
        method: "GET",
        url: "/api/sessions?limit=20"
      });
      expect(sessionList.statusCode).toBe(200);
      expect(parsePayload<Array<{ id: string }>>(sessionList.payload).data[0]?.id).toBe(session.id);

      const started = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/start`
      });
      expect(started.statusCode).toBe(200);
      expect(parsePayload<{ status: string }>(started.payload).data.status).toBe("running");

      await waitForMetrics(app, session.id);

      const marker = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/markers`,
        payload: {
          label: "Boss fight",
          description: "Entered heavy scene",
          tags: {
            phase: "combat"
          }
        }
      });
      expect(marker.statusCode).toBe(200);
      expect(parsePayload<{ label: string }>(marker.payload).data.label).toBe("Boss fight");

      const markers = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/markers`
      });
      expect(markers.statusCode).toBe(200);
      expect(parsePayload<Array<{ label: string }>>(markers.payload).data[0]?.label).toBe(
        "Boss fight"
      );

      const stopped = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/stop`
      });
      expect(stopped.statusCode).toBe(200);
      expect(parsePayload<{ status: string }>(stopped.payload).data.status).toBe("stopped");

      const metrics = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/metrics?limit=10`
      });
      expect(parsePayload<unknown[]>(metrics.payload).data.length).toBeGreaterThan(0);

      const report = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/report`
      });
      expect(report.statusCode).toBe(200);
      expect(
        parsePayload<{ summary: { durationMs: number } }>(report.payload).data.summary.durationMs
      ).toBeGreaterThanOrEqual(0);

      const jsonExport = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/export?format=json`
      });
      expect(jsonExport.headers["content-type"]).toContain("application/json");
      expect(JSON.parse(jsonExport.payload)).toMatchObject({ session: { id: session.id } });

      const csvExport = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/export?format=csv`
      });
      expect(csvExport.headers["content-type"]).toContain("text/csv");
      expect(csvExport.payload).toContain("timestampMs,monotonicMs,sequence");

      const htmlExport = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/export?format=html`
      });
      expect(htmlExport.headers["content-type"]).toContain("text/html");
      expect(htmlExport.payload).toContain("<!doctype html>");

      const localizedHtmlExport = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/export`,
        payload: {
          format: "html",
          localization: {
            locale: "zh-CN",
            direction: "ltr",
            strings: {
              title: "测试结果",
              summary: "核心指标"
            }
          }
        }
      });
      expect(localizedHtmlExport.headers["content-type"]).toContain("text/html");
      expect(localizedHtmlExport.payload).toContain('<html lang="zh-CN" dir="ltr">');
      expect(localizedHtmlExport.payload).toContain("LumaTrace · 测试结果");
      expect(localizedHtmlExport.payload).toContain("核心指标");

      const tools = await app.inject({ method: "GET", url: "/api/tools/status" });
      expect(parsePayload<unknown[]>(tools.payload).data.length).toBeGreaterThan(0);

      const diagnostics = await app.inject({ method: "GET", url: "/api/diagnostics" });
      expect(diagnostics.statusCode).toBe(200);

      const invalid = await app.inject({ method: "POST", url: "/api/sessions/missing/start" });
      expect(invalid.statusCode).toBe(404);
      expect(JSON.parse(invalid.payload)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND"
        }
      });

      const badExport = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/export?format=pdf`
      });
      expect(badExport.statusCode).toBe(400);
      expect(JSON.parse(badExport.payload)).toMatchObject({
        ok: false,
        error: {
          code: "EXPORT_FORMAT_UNSUPPORTED"
        }
      });
    } finally {
      await app.close();
    }
  });

  it("deletes individual or all stored results while protecting an active test", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const app = await createServer({
      database,
      enableLogger: false,
      metricBatchSize: 4,
      metricFlushIntervalMs: 20
    });

    try {
      const devices = parsePayload<Array<{ id: string }>>(
        (await app.inject({ method: "GET", url: "/api/devices" })).payload
      ).data;
      const deviceId = devices[0]?.id;
      const targets = parsePayload<Array<{ id: string }>>(
        (
          await app.inject({
            method: "GET",
            url: `/api/devices/${deviceId}/targets`
          })
        ).payload
      ).data;
      const targetId = targets[0]?.id;

      const createTest = async (name: string) =>
        parsePayload<{ id: string }>(
          (
            await app.inject({
              method: "POST",
              url: "/api/sessions",
              payload: {
                name,
                deviceId,
                targetId,
                sampleIntervalMs: 1
              }
            })
          ).payload
        ).data;

      const active = await createTest("Active result");
      const stored = await createTest("Stored result");
      await app.inject({ method: "POST", url: `/api/sessions/${active.id}/start` });
      await waitForMetrics(app, active.id);

      const activeDelete = await app.inject({
        method: "DELETE",
        url: `/api/sessions/${active.id}`
      });
      expect(activeDelete.statusCode).toBe(409);
      expect(JSON.parse(activeDelete.payload)).toMatchObject({
        ok: false,
        error: { code: "SESSION_ACTIVE" }
      });

      const deleteAll = await app.inject({ method: "DELETE", url: "/api/sessions" });
      expect(deleteAll.statusCode).toBe(200);
      expect(
        parsePayload<{ deletedCount: number; skippedSessionIds: string[] }>(deleteAll.payload).data
      ).toEqual({ deletedCount: 1, skippedSessionIds: [active.id] });
      expect(
        (await app.inject({ method: "GET", url: `/api/sessions/${stored.id}` })).statusCode
      ).toBe(404);
      expect(
        (await app.inject({ method: "GET", url: `/api/sessions/${active.id}` })).statusCode
      ).toBe(200);

      await app.inject({ method: "POST", url: `/api/sessions/${active.id}/stop` });
      const deleteOne = await app.inject({
        method: "DELETE",
        url: `/api/sessions/${active.id}`
      });
      expect(deleteOne.statusCode).toBe(200);
      expect(parsePayload<{ sessionId: string; deleted: boolean }>(deleteOne.payload).data).toEqual({
        sessionId: active.id,
        deleted: true
      });

      const list = await app.inject({ method: "GET", url: "/api/sessions?limit=20" });
      expect(parsePayload<unknown[]>(list.payload).data).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("finalizes interrupted sessions from an earlier process and makes them deletable", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const device: Device = {
      id: "recovery-device",
      platform: "windows",
      name: "Recovery device",
      osVersion: "Windows",
      connectionType: "local",
      capabilities: []
    };
    const target: Target = {
      id: "recovery-target",
      platform: "windows",
      name: "Recovery target",
      type: "process"
    };
    const session: Session = {
      id: "interrupted-session",
      name: "Interrupted session",
      deviceId: device.id,
      targetId: target.id,
      startedAt: 1_000,
      sampleIntervalMs: 1_000,
      status: "running"
    };

    new DeviceRepository(database).upsert(device);
    new TargetRepository(database).upsert(device.id, target);
    new SessionRepository(database).create(session);
    new MetricRepository(database).insertRaw({
      sessionId: session.id,
      timestampMs: 6_200,
      deviceId: device.id,
      targetId: target.id,
      metricName: "cpu_percent",
      value: 12,
      unit: "percent",
      source: "test",
      precision: "exact",
      confidence: "high"
    });

    const app = await createServer({
      database,
      enableAndroidCollector: false,
      enablePcCollector: false,
      enableLogger: false
    });

    try {
      const recovered = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}`
      });
      expect(recovered.statusCode).toBe(200);
      expect(parsePayload<{ status: string; endedAt: number }>(recovered.payload).data).toMatchObject({
        status: "stopped",
        endedAt: 6_200
      });

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/sessions/${session.id}`
      });
      expect(deleted.statusCode).toBe(200);
      expect(
        (await app.inject({ method: "GET", url: `/api/sessions/${session.id}` })).statusCode
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
