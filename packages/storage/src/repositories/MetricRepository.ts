import type { MetricConfidence, MetricEvent, MetricPrecision, Tags } from "@lumatrace/core";
import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";
import { parseJson, stringifyJson } from "../serialization/json";

export interface RawMetricQueryOptions {
  sessionId: string;
  fromTimestampMs?: number;
  toTimestampMs?: number;
  metricNames?: readonly string[];
  limit?: number;
  offset?: number;
}

export interface DownsampledMetricBucket {
  sessionId: string;
  bucketStartMs: number;
  bucketEndMs: number;
  metricName: string;
  count: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
  p50Value?: number;
  p95Value?: number;
  source?: string;
  precision?: MetricPrecision;
  tags?: Tags;
}

export interface DownsampledMetricQueryOptions {
  sessionId: string;
  metricNames?: readonly string[];
  fromBucketStartMs?: number;
  toBucketStartMs?: number;
  limit?: number;
  offset?: number;
}

interface RawMetricRow {
  session_id: string;
  timestamp_ms: number;
  monotonic_ms: number | null;
  sequence: number | null;
  device_id: string;
  target_id: string;
  metric_name: string;
  value: number | null;
  unit: string;
  source: string;
  precision: MetricPrecision;
  confidence: MetricConfidence | null;
  parser_version: string | null;
  tags_json: string | null;
}

interface CountRow {
  count: number;
}

interface DownsampledMetricRow {
  session_id: string;
  bucket_start_ms: number;
  bucket_end_ms: number;
  metric_name: string;
  count: number;
  min_value: number | null;
  max_value: number | null;
  avg_value: number | null;
  p50_value: number | null;
  p95_value: number | null;
  source: string | null;
  precision: MetricPrecision | null;
  tags_json: string | null;
}

function rowToMetricEvent(row: RawMetricRow): MetricEvent {
  const event: MetricEvent = {
    sessionId: row.session_id,
    timestampMs: row.timestamp_ms,
    deviceId: row.device_id,
    targetId: row.target_id,
    metricName: row.metric_name,
    value: row.value,
    unit: row.unit,
    source: row.source,
    precision: row.precision,
    confidence: row.confidence ?? "medium"
  };

  if (row.monotonic_ms !== null) {
    event.monotonicMs = row.monotonic_ms;
  }
  if (row.sequence !== null) {
    event.sequence = row.sequence;
  }
  if (row.parser_version !== null) {
    event.parserVersion = row.parser_version;
  }

  const tags = parseJson<Tags | undefined>(row.tags_json, undefined);
  if (tags !== undefined) {
    event.tags = tags;
  }

  return event;
}

function rowToDownsampledBucket(row: DownsampledMetricRow): DownsampledMetricBucket {
  const bucket: DownsampledMetricBucket = {
    sessionId: row.session_id,
    bucketStartMs: row.bucket_start_ms,
    bucketEndMs: row.bucket_end_ms,
    metricName: row.metric_name,
    count: row.count
  };

  if (row.min_value !== null) {
    bucket.minValue = row.min_value;
  }
  if (row.max_value !== null) {
    bucket.maxValue = row.max_value;
  }
  if (row.avg_value !== null) {
    bucket.avgValue = row.avg_value;
  }
  if (row.p50_value !== null) {
    bucket.p50Value = row.p50_value;
  }
  if (row.p95_value !== null) {
    bucket.p95Value = row.p95_value;
  }
  if (row.source !== null) {
    bucket.source = row.source;
  }
  if (row.precision !== null) {
    bucket.precision = row.precision;
  }

  const tags = parseJson<Tags | undefined>(row.tags_json, undefined);
  if (tags !== undefined) {
    bucket.tags = tags;
  }

  return bucket;
}

function appendMetricNameFilter(
  clauses: string[],
  params: (string | number)[],
  metricNames?: readonly string[]
): void {
  if (metricNames === undefined || metricNames.length === 0) {
    return;
  }

  const placeholders = metricNames.map(() => "?").join(", ");
  clauses.push(`metric_name IN (${placeholders})`);
  params.push(...metricNames);
}

export class MetricRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  insertRaw(event: MetricEvent): void {
    this.rawInsertStatement().run(
      event.sessionId,
      event.timestampMs,
      event.monotonicMs ?? null,
      event.sequence ?? null,
      event.deviceId,
      event.targetId,
      event.metricName,
      event.value,
      event.unit,
      event.source,
      event.precision,
      event.confidence,
      event.parserVersion ?? null,
      stringifyJson(event.tags),
      Date.now()
    );
  }

  insertRawBatch(events: readonly MetricEvent[]): void {
    if (events.length === 0) {
      return;
    }

    const insert = this.rawInsertStatement();
    const insertMany = this.db.transaction((items: readonly MetricEvent[]) => {
      const now = Date.now();
      for (const event of items) {
        insert.run(
          event.sessionId,
          event.timestampMs,
          event.monotonicMs ?? null,
          event.sequence ?? null,
          event.deviceId,
          event.targetId,
          event.metricName,
          event.value,
          event.unit,
          event.source,
          event.precision,
          event.confidence,
          event.parserVersion ?? null,
          stringifyJson(event.tags),
          now
        );
      }
    });

    insertMany(events);
  }

  queryRaw(options: RawMetricQueryOptions): MetricEvent[] {
    const clauses = ["session_id = ?"];
    const params: (string | number)[] = [options.sessionId];

    if (options.fromTimestampMs !== undefined) {
      clauses.push("timestamp_ms >= ?");
      params.push(options.fromTimestampMs);
    }
    if (options.toTimestampMs !== undefined) {
      clauses.push("timestamp_ms <= ?");
      params.push(options.toTimestampMs);
    }
    appendMetricNameFilter(clauses, params, options.metricNames);

    let sql = `
      SELECT * FROM metric_events_raw
      WHERE ${clauses.join(" AND ")}
      ORDER BY timestamp_ms ASC, sequence ASC, id ASC
    `;

    if (options.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    if (options.offset !== undefined) {
      sql += options.limit === undefined ? " LIMIT -1 OFFSET ?" : " OFFSET ?";
      params.push(options.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as RawMetricRow[];
    return rows.map((row) => rowToMetricEvent(row));
  }

  countRaw(sessionId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM metric_events_raw WHERE session_id = ?")
      .get(sessionId) as CountRow;
    return row.count;
  }

  deleteBySession(sessionId: string): void {
    this.db.prepare("DELETE FROM metric_events_raw WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM metric_events_downsampled WHERE session_id = ?").run(sessionId);
  }

  insertDownsampled(bucket: DownsampledMetricBucket): void {
    this.db
      .prepare(
        `
        INSERT INTO metric_events_downsampled (
          session_id, bucket_start_ms, bucket_end_ms, metric_name, count,
          min_value, max_value, avg_value, p50_value, p95_value,
          source, precision, tags_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        bucket.sessionId,
        bucket.bucketStartMs,
        bucket.bucketEndMs,
        bucket.metricName,
        bucket.count,
        bucket.minValue ?? null,
        bucket.maxValue ?? null,
        bucket.avgValue ?? null,
        bucket.p50Value ?? null,
        bucket.p95Value ?? null,
        bucket.source ?? null,
        bucket.precision ?? null,
        stringifyJson(bucket.tags),
        Date.now()
      );
  }

  queryDownsampled(options: DownsampledMetricQueryOptions): DownsampledMetricBucket[] {
    const clauses = ["session_id = ?"];
    const params: (string | number)[] = [options.sessionId];

    if (options.fromBucketStartMs !== undefined) {
      clauses.push("bucket_start_ms >= ?");
      params.push(options.fromBucketStartMs);
    }
    if (options.toBucketStartMs !== undefined) {
      clauses.push("bucket_start_ms <= ?");
      params.push(options.toBucketStartMs);
    }
    appendMetricNameFilter(clauses, params, options.metricNames);

    let sql = `
      SELECT * FROM metric_events_downsampled
      WHERE ${clauses.join(" AND ")}
      ORDER BY bucket_start_ms ASC, metric_name ASC, id ASC
    `;

    if (options.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    if (options.offset !== undefined) {
      sql += options.limit === undefined ? " LIMIT -1 OFFSET ?" : " OFFSET ?";
      params.push(options.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as DownsampledMetricRow[];
    return rows.map((row) => rowToDownsampledBucket(row));
  }

  private rawInsertStatement(): Database.Statement {
    return this.db.prepare(`
      INSERT INTO metric_events_raw (
        session_id, timestamp_ms, monotonic_ms, sequence, device_id, target_id,
        metric_name, value, unit, source, precision, confidence, parser_version,
        tags_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
}
