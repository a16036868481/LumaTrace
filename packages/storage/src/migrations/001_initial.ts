import type Database from "better-sqlite3";
import { INITIAL_MIGRATION_VERSION } from "../schema";

export const migration001Initial = {
  version: INITIAL_MIGRATION_VERSION,
  apply(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        name TEXT NOT NULL,
        os_version TEXT,
        connection_type TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        tags_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS targets (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        platform TEXT NOT NULL,
        package_name TEXT,
        bundle_id TEXT,
        pid INTEGER,
        executable_path TEXT,
        tags_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        sample_interval_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        notes_json TEXT,
        config_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
        FOREIGN KEY(target_id) REFERENCES targets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS metric_events_raw (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        monotonic_ms REAL,
        sequence INTEGER,
        device_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL,
        unit TEXT NOT NULL,
        source TEXT NOT NULL,
        precision TEXT NOT NULL,
        confidence TEXT,
        parser_version TEXT,
        tags_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_metric_raw_session_time
        ON metric_events_raw(session_id, timestamp_ms);
      CREATE INDEX IF NOT EXISTS idx_metric_raw_session_metric_time
        ON metric_events_raw(session_id, metric_name, timestamp_ms);
      CREATE INDEX IF NOT EXISTS idx_metric_raw_session_sequence
        ON metric_events_raw(session_id, sequence);

      CREATE TABLE IF NOT EXISTS metric_events_downsampled (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        bucket_start_ms INTEGER NOT NULL,
        bucket_end_ms INTEGER NOT NULL,
        metric_name TEXT NOT NULL,
        count INTEGER NOT NULL,
        min_value REAL,
        max_value REAL,
        avg_value REAL,
        p50_value REAL,
        p95_value REAL,
        source TEXT,
        precision TEXT,
        tags_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_metric_downsampled_session_metric_bucket
        ON metric_events_downsampled(session_id, metric_name, bucket_start_ms);

      CREATE TABLE IF NOT EXISTS event_markers (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        tags_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_markers_session_time
        ON event_markers(session_id, timestamp_ms);

      CREATE TABLE IF NOT EXISTS reports (
        session_id TEXT PRIMARY KEY,
        summary_json TEXT NOT NULL,
        html_path TEXT,
        json_path TEXT,
        csv_path TEXT,
        generated_at INTEGER NOT NULL,
        version TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tool_status (
        tool_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        version TEXT,
        path TEXT,
        reason TEXT,
        suggested_action TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diagnostics (
        id TEXT PRIMARY KEY,
        timestamp_ms INTEGER NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT,
        session_id TEXT,
        device_id TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_diagnostics_time
        ON diagnostics(timestamp_ms);
      CREATE INDEX IF NOT EXISTS idx_diagnostics_session
        ON diagnostics(session_id);
    `);
  }
};

export const migrations = [migration001Initial] as const;
