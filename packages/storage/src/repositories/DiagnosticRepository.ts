import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";
import { parseJson, stringifyJson } from "../serialization/json";

export interface DiagnosticRecord {
  id: string;
  timestampMs: number;
  level: "debug" | "info" | "warn" | "error";
  category: string;
  message: string;
  details?: Record<string, unknown>;
  sessionId?: string;
  deviceId?: string;
}

export interface DiagnosticListOptions {
  sessionId?: string;
  deviceId?: string;
  level?: DiagnosticRecord["level"];
  limit?: number;
  fromTimestampMs?: number;
  toTimestampMs?: number;
}

interface DiagnosticRow {
  id: string;
  timestamp_ms: number;
  level: DiagnosticRecord["level"];
  category: string;
  message: string;
  details_json: string | null;
  session_id: string | null;
  device_id: string | null;
}

function rowToDiagnostic(row: DiagnosticRow): DiagnosticRecord {
  const record: DiagnosticRecord = {
    id: row.id,
    timestampMs: row.timestamp_ms,
    level: row.level,
    category: row.category,
    message: row.message
  };

  const details = parseJson<Record<string, unknown> | undefined>(row.details_json, undefined);
  if (details !== undefined) {
    record.details = details;
  }
  if (row.session_id !== null) {
    record.sessionId = row.session_id;
  }
  if (row.device_id !== null) {
    record.deviceId = row.device_id;
  }

  return record;
}

export class DiagnosticRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  create(record: DiagnosticRecord): void {
    this.db
      .prepare(
        `
        INSERT INTO diagnostics (
          id, timestamp_ms, level, category, message, details_json, session_id, device_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        record.id,
        record.timestampMs,
        record.level,
        record.category,
        record.message,
        stringifyJson(record.details),
        record.sessionId ?? null,
        record.deviceId ?? null,
        Date.now()
      );
  }

  getById(id: string): DiagnosticRecord | null {
    const row = this.db.prepare("SELECT * FROM diagnostics WHERE id = ?").get(id) as
      | DiagnosticRow
      | undefined;
    return row === undefined ? null : rowToDiagnostic(row);
  }

  list(options: DiagnosticListOptions = {}): DiagnosticRecord[] {
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    if (options.sessionId !== undefined) {
      clauses.push("session_id = ?");
      params.push(options.sessionId);
    }
    if (options.deviceId !== undefined) {
      clauses.push("device_id = ?");
      params.push(options.deviceId);
    }
    if (options.level !== undefined) {
      clauses.push("level = ?");
      params.push(options.level);
    }
    if (options.fromTimestampMs !== undefined) {
      clauses.push("timestamp_ms >= ?");
      params.push(options.fromTimestampMs);
    }
    if (options.toTimestampMs !== undefined) {
      clauses.push("timestamp_ms <= ?");
      params.push(options.toTimestampMs);
    }

    let sql = "SELECT * FROM diagnostics";
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY timestamp_ms DESC, created_at DESC, id ASC";

    if (options.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as DiagnosticRow[];
    return rows.map((row) => rowToDiagnostic(row));
  }

  deleteBySession(sessionId: string): void {
    this.db.prepare("DELETE FROM diagnostics WHERE session_id = ?").run(sessionId);
  }
}
