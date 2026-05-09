import type { ReportSummary } from "@lumatrace/core";
import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";
import { parseJson, stringifyJson } from "../serialization/json";

export interface ReportCacheRecord {
  sessionId: string;
  summary: ReportSummary;
  htmlPath?: string;
  jsonPath?: string;
  csvPath?: string;
  generatedAt: number;
  version: string;
}

interface ReportRow {
  session_id: string;
  summary_json: string;
  html_path: string | null;
  json_path: string | null;
  csv_path: string | null;
  generated_at: number;
  version: string;
}

function rowToReport(row: ReportRow): ReportCacheRecord {
  const record: ReportCacheRecord = {
    sessionId: row.session_id,
    summary: parseJson<ReportSummary>(row.summary_json, { durationMs: 0 }),
    generatedAt: row.generated_at,
    version: row.version
  };

  if (row.html_path !== null) {
    record.htmlPath = row.html_path;
  }
  if (row.json_path !== null) {
    record.jsonPath = row.json_path;
  }
  if (row.csv_path !== null) {
    record.csvPath = row.csv_path;
  }

  return record;
}

export class ReportRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  save(
    sessionId: string,
    summary: ReportSummary,
    paths: { htmlPath?: string; jsonPath?: string; csvPath?: string } = {},
    version = "storage-cache-v1"
  ): void {
    this.db
      .prepare(
        `
        INSERT INTO reports (
          session_id, summary_json, html_path, json_path, csv_path, generated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          summary_json = excluded.summary_json,
          html_path = excluded.html_path,
          json_path = excluded.json_path,
          csv_path = excluded.csv_path,
          generated_at = excluded.generated_at,
          version = excluded.version
      `
      )
      .run(
        sessionId,
        stringifyJson(summary) ?? "{\"durationMs\":0}",
        paths.htmlPath ?? null,
        paths.jsonPath ?? null,
        paths.csvPath ?? null,
        Date.now(),
        version
      );
  }

  get(sessionId: string): ReportCacheRecord | null {
    const row = this.db.prepare("SELECT * FROM reports WHERE session_id = ?").get(sessionId) as
      | ReportRow
      | undefined;
    return row === undefined ? null : rowToReport(row);
  }

  delete(sessionId: string): void {
    this.db.prepare("DELETE FROM reports WHERE session_id = ?").run(sessionId);
  }
}
