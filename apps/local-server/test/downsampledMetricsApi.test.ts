import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type Device, type MetricEvent, type Session, type Target } from "@lumatrace/core";
import {
  DeviceRepository,
  MetricRepository,
  LumaTraceDatabase,
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

function seedSession(database: LumaTraceDatabase): void {
  const device: Device = {
    id: "device-1",
    platform: "windows",
    name: "Metric Device",
    connectionType: "local",
    capabilities: []
  };
  const target: Target = {
    id: "target-1",
    name: "Metric Target",
    type: "process",
    platform: "windows"
  };
  const session: Session = {
    id: "session-1",
    name: "Downsample Session",
    deviceId: device.id,
    targetId: target.id,
    startedAt: 1000,
    sampleIntervalMs: 100,
    status: "stopped"
  };

  new DeviceRepository(database).upsert(device);
  new TargetRepository(database).upsert(device.id, target);
  new SessionRepository(database).create(session);
}

function metric(overrides: Partial<MetricEvent> = {}): MetricEvent {
  return {
    sessionId: "session-1",
    timestampMs: 1000,
    deviceId: "device-1",
    targetId: "target-1",
    metricName: METRIC_NAMES.CPU_PERCENT,
    value: 10,
    unit: METRIC_UNITS.PERCENT,
    source: "test",
    precision: "estimated",
    confidence: "high",
    ...overrides
  };
}

describe("downsampled metrics API", () => {
  it("returns bucketed numeric metrics without converting missing values to zero", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    seedSession(database);
    new MetricRepository(database).insertRawBatch([
      metric({ timestampMs: 1000, value: 10 }),
      metric({ timestampMs: 1200, value: 20 }),
      metric({ timestampMs: 1300, value: null }),
      metric({ timestampMs: 2100, value: 40 }),
      metric({
        timestampMs: 2200,
        metricName: METRIC_NAMES.MEMORY_MB,
        unit: METRIC_UNITS.MEGABYTES,
        value: 512
      })
    ]);
    const app = await createServer({
      database,
      enableLogger: false,
      enableAndroidCollector: false,
      enablePcCollector: false,
      enableIosCollector: false
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/sessions/session-1/metrics/downsampled?bucketSizeMs=1000&metricNames=cpu_percent"
      });

      expect(response.statusCode).toBe(200);
      const buckets = parsePayload<
        Array<{
          bucketStartMs: number;
          count: number;
          avgValue?: number;
          minValue?: number;
          maxValue?: number;
          tags?: Record<string, unknown>;
        }>
      >(response.payload).data;

      expect(buckets).toHaveLength(2);
      expect(buckets[0]).toMatchObject({
        bucketStartMs: 1000,
        count: 2,
        minValue: 10,
        maxValue: 20,
        avgValue: 15,
        tags: {
          downsampled: true,
          bucketSizeMs: 1000
        }
      });
      expect(buckets[1]).toMatchObject({
        bucketStartMs: 2000,
        count: 1,
        avgValue: 40
      });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid bucket sizes", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    seedSession(database);
    const app = await createServer({
      database,
      enableLogger: false,
      enableAndroidCollector: false,
      enablePcCollector: false,
      enableIosCollector: false
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/sessions/session-1/metrics/downsampled?bucketSizeMs=0"
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toMatchObject({
        ok: false,
        error: {
          code: "INVALID_REQUEST"
        }
      });
    } finally {
      await app.close();
    }
  });
});
