import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type Device, type MetricEvent, type Session, type Target } from "@lumatrace/core";
import {
  DeviceRepository,
  MetricRepository,
  LumaTraceDatabase,
  SessionRepository,
  TargetRepository
} from "../src";

function createDatabase(): LumaTraceDatabase {
  return new LumaTraceDatabase({ dbPath: ":memory:" });
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
    type: "game",
    platform: "windows"
  };
  const session: Session = {
    id: "session-1",
    name: "Metric Session",
    deviceId: "device-1",
    targetId: "target-1",
    startedAt: 1000,
    sampleIntervalMs: 1000,
    status: "running"
  };

  new DeviceRepository(database).upsert(device);
  new TargetRepository(database).upsert("device-1", target);
  new SessionRepository(database).create(session);
}

function metric(overrides: Partial<MetricEvent> = {}): MetricEvent {
  return {
    sessionId: "session-1",
    timestampMs: 1000,
    monotonicMs: 0,
    sequence: 0,
    deviceId: "device-1",
    targetId: "target-1",
    metricName: METRIC_NAMES.FPS,
    value: 60,
    unit: METRIC_UNITS.FPS,
    source: "mock",
    precision: "estimated",
    confidence: "high",
    parserVersion: "test-v1",
    tags: {
      profileName: "storage-test",
      refreshRate: 60
    },
    ...overrides
  };
}

describe("MetricRepository", () => {
  it("inserts one raw metric and counts it", () => {
    const database = createDatabase();
    seedSession(database);
    const metrics = new MetricRepository(database);

    try {
      metrics.insertRaw(metric());

      expect(metrics.countRaw("session-1")).toBe(1);
      expect(metrics.queryRaw({ sessionId: "session-1" })[0]?.metricName).toBe(METRIC_NAMES.FPS);
    } finally {
      database.close();
    }
  });

  it("batch inserts metrics and queries by time range, metric names, limit, and offset", () => {
    const database = createDatabase();
    seedSession(database);
    const metrics = new MetricRepository(database);

    try {
      metrics.insertRawBatch([
        metric({ timestampMs: 1000, sequence: 2, metricName: METRIC_NAMES.CPU_PERCENT, unit: METRIC_UNITS.PERCENT, value: 30 }),
        metric({ timestampMs: 1000, sequence: 1, metricName: METRIC_NAMES.FPS, unit: METRIC_UNITS.FPS, value: 58 }),
        metric({ timestampMs: 1200, sequence: 3, metricName: METRIC_NAMES.MEMORY_MB, unit: METRIC_UNITS.MEGABYTES, value: 512 }),
        metric({ timestampMs: 1400, sequence: 4, metricName: METRIC_NAMES.FRAME_TIME_MS, unit: METRIC_UNITS.MILLISECONDS, value: 17 })
      ]);

      expect(metrics.countRaw("session-1")).toBe(4);
      expect(
        metrics.queryRaw({
          sessionId: "session-1",
          fromTimestampMs: 1100,
          toTimestampMs: 1400
        }).map((event) => event.metricName)
      ).toEqual([METRIC_NAMES.MEMORY_MB, METRIC_NAMES.FRAME_TIME_MS]);
      expect(
        metrics.queryRaw({
          sessionId: "session-1",
          metricNames: [METRIC_NAMES.FPS, METRIC_NAMES.CPU_PERCENT]
        }).map((event) => event.metricName)
      ).toEqual([METRIC_NAMES.FPS, METRIC_NAMES.CPU_PERCENT]);
      expect(
        metrics.queryRaw({
          sessionId: "session-1",
          limit: 2,
          offset: 1
        }).map((event) => event.sequence)
      ).toEqual([2, 3]);
    } finally {
      database.close();
    }
  });

  it("roundtrips tags JSON and null values", () => {
    const database = createDatabase();
    seedSession(database);
    const metrics = new MetricRepository(database);

    try {
      metrics.insertRaw(
        metric({
          value: null,
          tags: {
            profileName: "null-test",
            refreshRate: 60,
            important: true
          }
        })
      );

      const event = metrics.queryRaw({ sessionId: "session-1" })[0];
      expect(event?.value).toBeNull();
      expect(event?.tags).toEqual({
        profileName: "null-test",
        refreshRate: 60,
        important: true
      });
    } finally {
      database.close();
    }
  });

  it("keeps stable ordering by timestamp, sequence, and insertion id", () => {
    const database = createDatabase();
    seedSession(database);
    const metrics = new MetricRepository(database);

    try {
      metrics.insertRawBatch([
        metric({ timestampMs: 1000, sequence: 2, value: 2 }),
        metric({ timestampMs: 1000, sequence: 1, value: 1 }),
        metric({ timestampMs: 1000, sequence: 1, value: 1.5 })
      ]);

      expect(metrics.queryRaw({ sessionId: "session-1" }).map((event) => event.value)).toEqual([
        1,
        1.5,
        2
      ]);
    } finally {
      database.close();
    }
  });

  it("inserts and queries downsampled buckets", () => {
    const database = createDatabase();
    seedSession(database);
    const metrics = new MetricRepository(database);

    try {
      metrics.insertDownsampled({
        sessionId: "session-1",
        bucketStartMs: 1000,
        bucketEndMs: 2000,
        metricName: METRIC_NAMES.FPS,
        count: 60,
        minValue: 45,
        maxValue: 60,
        avgValue: 57,
        p50Value: 58,
        p95Value: 60,
        source: "mock",
        precision: "estimated",
        tags: {
          profileName: "bucket"
        }
      });

      const buckets = metrics.queryDownsampled({
        sessionId: "session-1",
        metricNames: [METRIC_NAMES.FPS]
      });
      expect(buckets).toHaveLength(1);
      expect(buckets[0]?.avgValue).toBe(57);
      expect(buckets[0]?.tags).toEqual({ profileName: "bucket" });
    } finally {
      database.close();
    }
  });

  it("batch inserts many metrics in one transaction from the caller perspective", () => {
    const database = createDatabase();
    seedSession(database);
    const metrics = new MetricRepository(database);

    try {
      const events = Array.from({ length: 250 }, (_unused, index) =>
        metric({
          timestampMs: 1000 + index,
          sequence: index,
          value: index
        })
      );

      metrics.insertRawBatch(events);
      expect(metrics.countRaw("session-1")).toBe(250);
    } finally {
      database.close();
    }
  });

  it("cascades raw metrics when the session is deleted", () => {
    const database = createDatabase();
    seedSession(database);
    const sessions = new SessionRepository(database);
    const metrics = new MetricRepository(database);

    try {
      metrics.insertRaw(metric());
      sessions.delete("session-1");

      expect(metrics.countRaw("session-1")).toBe(0);
    } finally {
      database.close();
    }
  });
});
