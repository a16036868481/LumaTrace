import type { Device, MetricAvailability, Tags } from "@lumatrace/core";
import type Database from "better-sqlite3";
import type { LumaTraceDatabase } from "../Database";
import { parseJson, stringifyJson } from "../serialization/json";

interface DeviceRow {
  id: string;
  platform: Device["platform"];
  name: string;
  os_version: string | null;
  connection_type: Device["connectionType"];
  capabilities_json: string;
  tags_json: string | null;
}

function rowToDevice(row: DeviceRow): Device {
  const device: Device = {
    id: row.id,
    platform: row.platform,
    name: row.name,
    connectionType: row.connection_type,
    capabilities: parseJson<MetricAvailability[]>(row.capabilities_json, [])
  };

  if (row.os_version !== null) {
    device.osVersion = row.os_version;
  }

  const tags = parseJson<Tags | undefined>(row.tags_json, undefined);
  if (tags !== undefined) {
    device.tags = tags;
  }

  return device;
}

export class DeviceRepository {
  private readonly db: Database.Database;

  constructor(database: LumaTraceDatabase) {
    this.db = database.getNativeDatabase();
  }

  upsert(device: Device): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO devices (
          id, platform, name, os_version, connection_type, capabilities_json, tags_json,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          platform = excluded.platform,
          name = excluded.name,
          os_version = excluded.os_version,
          connection_type = excluded.connection_type,
          capabilities_json = excluded.capabilities_json,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at
      `
      )
      .run(
        device.id,
        device.platform,
        device.name,
        device.osVersion ?? null,
        device.connectionType,
        stringifyJson(device.capabilities) ?? "[]",
        stringifyJson(device.tags),
        now,
        now
      );
  }

  getById(id: string): Device | null {
    const row = this.db.prepare("SELECT * FROM devices WHERE id = ?").get(id) as DeviceRow | undefined;
    return row === undefined ? null : rowToDevice(row);
  }

  list(): Device[] {
    const rows = this.db
      .prepare("SELECT * FROM devices ORDER BY updated_at DESC, id ASC")
      .all() as DeviceRow[];
    return rows.map((row) => rowToDevice(row));
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM devices WHERE id = ?").run(id);
  }
}
