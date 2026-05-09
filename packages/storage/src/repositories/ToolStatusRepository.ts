import type { ToolStatus } from "@lumatrace/core";
import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";

interface ToolStatusRow {
  tool_name: ToolStatus["toolName"];
  status: ToolStatus["status"];
  version: string | null;
  path: string | null;
  reason: string | null;
  suggested_action: string | null;
}

function rowToToolStatus(row: ToolStatusRow): ToolStatus {
  const status: ToolStatus = {
    toolName: row.tool_name,
    status: row.status
  };

  if (row.version !== null) {
    status.version = row.version;
  }
  if (row.path !== null) {
    status.path = row.path;
  }
  if (row.reason !== null) {
    status.reason = row.reason;
  }
  if (row.suggested_action !== null) {
    status.suggestedAction = row.suggested_action;
  }

  return status;
}

export class ToolStatusRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  upsert(status: ToolStatus): void {
    this.db
      .prepare(
        `
        INSERT INTO tool_status (
          tool_name, status, version, path, reason, suggested_action, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tool_name) DO UPDATE SET
          status = excluded.status,
          version = excluded.version,
          path = excluded.path,
          reason = excluded.reason,
          suggested_action = excluded.suggested_action,
          updated_at = excluded.updated_at
      `
      )
      .run(
        status.toolName,
        status.status,
        status.version ?? null,
        status.path ?? null,
        status.reason ?? null,
        status.suggestedAction ?? null,
        Date.now()
      );
  }

  get(toolName: ToolStatus["toolName"]): ToolStatus | null {
    const row = this.db.prepare("SELECT * FROM tool_status WHERE tool_name = ?").get(toolName) as
      | ToolStatusRow
      | undefined;
    return row === undefined ? null : rowToToolStatus(row);
  }

  list(): ToolStatus[] {
    const rows = this.db
      .prepare("SELECT * FROM tool_status ORDER BY tool_name ASC")
      .all() as ToolStatusRow[];
    return rows.map((row) => rowToToolStatus(row));
  }

  delete(toolName: string): void {
    this.db.prepare("DELETE FROM tool_status WHERE tool_name = ?").run(toolName);
  }
}
