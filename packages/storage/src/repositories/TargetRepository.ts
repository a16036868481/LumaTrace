import type { Tags, Target } from "@lumatrace/core";
import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";
import { parseJson, stringifyJson } from "../serialization/json";

interface TargetRow {
  id: string;
  name: string;
  type: Target["type"];
  platform: Target["platform"];
  package_name: string | null;
  bundle_id: string | null;
  pid: number | null;
  executable_path: string | null;
  tags_json: string | null;
}

function rowToTarget(row: TargetRow): Target {
  const target: Target = {
    id: row.id,
    name: row.name,
    type: row.type,
    platform: row.platform
  };

  if (row.package_name !== null) {
    target.packageName = row.package_name;
  }
  if (row.bundle_id !== null) {
    target.bundleId = row.bundle_id;
  }
  if (row.pid !== null) {
    target.pid = row.pid;
  }
  if (row.executable_path !== null) {
    target.executablePath = row.executable_path;
  }

  const tags = parseJson<Tags | undefined>(row.tags_json, undefined);
  if (tags !== undefined) {
    target.tags = tags;
  }

  return target;
}

export class TargetRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  upsert(deviceId: string, target: Target): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO targets (
          id, device_id, name, type, platform, package_name, bundle_id, pid,
          executable_path, tags_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          device_id = excluded.device_id,
          name = excluded.name,
          type = excluded.type,
          platform = excluded.platform,
          package_name = excluded.package_name,
          bundle_id = excluded.bundle_id,
          pid = excluded.pid,
          executable_path = excluded.executable_path,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at
      `
      )
      .run(
        target.id,
        deviceId,
        target.name,
        target.type,
        target.platform,
        target.packageName ?? null,
        target.bundleId ?? null,
        target.pid ?? null,
        target.executablePath ?? null,
        stringifyJson(target.tags),
        now,
        now
      );
  }

  getById(id: string): Target | null {
    const row = this.db.prepare("SELECT * FROM targets WHERE id = ?").get(id) as TargetRow | undefined;
    return row === undefined ? null : rowToTarget(row);
  }

  listByDevice(deviceId: string): Target[] {
    const rows = this.db
      .prepare("SELECT * FROM targets WHERE device_id = ? ORDER BY updated_at DESC, id ASC")
      .all(deviceId) as TargetRow[];
    return rows.map((row) => rowToTarget(row));
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM targets WHERE id = ?").run(id);
  }
}
