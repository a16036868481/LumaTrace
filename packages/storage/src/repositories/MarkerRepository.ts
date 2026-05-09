import type { EventMarker, Tags } from "@lumatrace/core";
import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";
import { parseJson, stringifyJson } from "../serialization/json";

interface MarkerRow {
  id: string;
  session_id: string;
  timestamp_ms: number;
  label: string;
  description: string | null;
  tags_json: string | null;
}

function rowToMarker(row: MarkerRow): EventMarker {
  const marker: EventMarker = {
    id: row.id,
    sessionId: row.session_id,
    timestampMs: row.timestamp_ms,
    label: row.label
  };

  if (row.description !== null) {
    marker.description = row.description;
  }

  const tags = parseJson<Tags | undefined>(row.tags_json, undefined);
  if (tags !== undefined) {
    marker.tags = tags;
  }

  return marker;
}

export class MarkerRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  create(marker: EventMarker): void {
    this.db
      .prepare(
        `
        INSERT INTO event_markers (
          id, session_id, timestamp_ms, label, description, tags_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        marker.id,
        marker.sessionId,
        marker.timestampMs,
        marker.label,
        marker.description ?? null,
        stringifyJson(marker.tags),
        Date.now()
      );
  }

  getById(id: string): EventMarker | null {
    const row = this.db.prepare("SELECT * FROM event_markers WHERE id = ?").get(id) as
      | MarkerRow
      | undefined;
    return row === undefined ? null : rowToMarker(row);
  }

  listBySession(sessionId: string): EventMarker[] {
    const rows = this.db
      .prepare("SELECT * FROM event_markers WHERE session_id = ? ORDER BY timestamp_ms ASC, id ASC")
      .all(sessionId) as MarkerRow[];
    return rows.map((row) => rowToMarker(row));
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM event_markers WHERE id = ?").run(id);
  }
}
