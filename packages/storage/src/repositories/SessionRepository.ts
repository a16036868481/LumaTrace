import type { Session } from "@lumatrace/core";
import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";
import { parseJson, stringifyJson } from "../serialization/json";

interface SessionRow {
  id: string;
  name: string;
  device_id: string;
  target_id: string;
  started_at: number | null;
  ended_at: number | null;
  sample_interval_ms: number;
  status: Session["status"];
  notes_json: string | null;
  config_json: string | null;
}

function rowToSession(row: SessionRow): Session {
  const session: Session = {
    id: row.id,
    name: row.name,
    deviceId: row.device_id,
    targetId: row.target_id,
    sampleIntervalMs: row.sample_interval_ms,
    status: row.status
  };

  if (row.started_at !== null) {
    session.startedAt = row.started_at;
  }
  if (row.ended_at !== null) {
    session.endedAt = row.ended_at;
  }

  const notes = parseJson<string[] | undefined>(row.notes_json, undefined);
  if (notes !== undefined) {
    session.notes = notes;
  }

  const config = parseJson<Record<string, unknown> | undefined>(row.config_json, undefined);
  if (config !== undefined) {
    session.config = config;
  }

  return session;
}

export class SessionRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  create(session: Session): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO sessions (
          id, name, device_id, target_id, started_at, ended_at, sample_interval_ms, status,
          notes_json, config_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        session.id,
        session.name,
        session.deviceId,
        session.targetId,
        session.startedAt ?? null,
        session.endedAt ?? null,
        session.sampleIntervalMs,
        session.status,
        stringifyJson(session.notes),
        stringifyJson(session.config),
        now,
        now
      );
  }

  upsert(session: Session): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO sessions (
          id, name, device_id, target_id, started_at, ended_at, sample_interval_ms, status,
          notes_json, config_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          device_id = excluded.device_id,
          target_id = excluded.target_id,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          sample_interval_ms = excluded.sample_interval_ms,
          status = excluded.status,
          notes_json = excluded.notes_json,
          config_json = excluded.config_json,
          updated_at = excluded.updated_at
      `
      )
      .run(
        session.id,
        session.name,
        session.deviceId,
        session.targetId,
        session.startedAt ?? null,
        session.endedAt ?? null,
        session.sampleIntervalMs,
        session.status,
        stringifyJson(session.notes),
        stringifyJson(session.config),
        now,
        now
      );
  }

  getById(id: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | SessionRow
      | undefined;
    return row === undefined ? null : rowToSession(row);
  }

  list(limit = 100): Session[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM sessions
        ORDER BY COALESCE(started_at, created_at) DESC, created_at DESC, id ASC
        LIMIT ?
      `
      )
      .all(limit) as SessionRow[];
    return rows.map((row) => rowToSession(row));
  }

  listAll(): Session[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM sessions
        ORDER BY COALESCE(started_at, created_at) DESC, created_at DESC, id ASC
      `
      )
      .all() as SessionRow[];
    return rows.map((row) => rowToSession(row));
  }

  listByDevice(deviceId: string, limit = 100): Session[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM sessions
        WHERE device_id = ?
        ORDER BY COALESCE(started_at, created_at) DESC, created_at DESC, id ASC
        LIMIT ?
      `
      )
      .all(deviceId, limit) as SessionRow[];
    return rows.map((row) => rowToSession(row));
  }

  updateStatus(
    sessionId: string,
    status: Session["status"],
    timestamps: { startedAt?: number; endedAt?: number } = {}
  ): void {
    this.db
      .prepare(
        `
        UPDATE sessions
        SET status = ?,
            started_at = COALESCE(?, started_at),
            ended_at = COALESCE(?, ended_at),
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(status, timestamps.startedAt ?? null, timestamps.endedAt ?? null, Date.now(), sessionId);
  }

  finalizeInterruptedSessions(): number {
    const result = this.db
      .prepare(
        `
        UPDATE sessions
        SET status = 'stopped',
            ended_at = COALESCE(
              ended_at,
              (
                SELECT MAX(metric_events_raw.timestamp_ms)
                FROM metric_events_raw
                WHERE metric_events_raw.session_id = sessions.id
              ),
              started_at,
              updated_at
            ),
            updated_at = ?
        WHERE status IN ('running', 'paused')
      `
      )
      .run(Date.now());
    return result.changes;
  }

  delete(sessionId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
}
