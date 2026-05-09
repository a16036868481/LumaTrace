import SQLiteDatabase from "better-sqlite3";
import type Database from "better-sqlite3";
import { migrations } from "./migrations/001_initial";

export interface LumaTraceDatabaseOptions {
  dbPath?: string;
  readonly?: boolean;
  runMigrations?: boolean;
  pragmas?: boolean;
}

interface MigrationRow {
  version: string;
}

export class LumaTraceDatabase {
  private readonly db: Database.Database;
  private closed = false;

  constructor(options: LumaTraceDatabaseOptions = {}) {
    const dbPath = options.dbPath ?? ":memory:";
    this.db = new SQLiteDatabase(dbPath, {
      readonly: options.readonly ?? false
    });

    if (options.pragmas !== false) {
      this.applyPragmas(dbPath);
    }

    if (options.runMigrations !== false) {
      this.migrate();
    }
  }

  migrate(): void {
    this.assertOpen();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const hasMigration = this.db.prepare("SELECT version FROM schema_migrations WHERE version = ? LIMIT 1");
    const insertMigration = this.db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)"
    );

    const applyMigrations = this.db.transaction(() => {
      for (const migration of migrations) {
        const row = hasMigration.get(migration.version) as MigrationRow | undefined;
        if (row === undefined) {
          migration.apply(this.db);
          insertMigration.run(migration.version, Date.now());
        }
      }
    });

    applyMigrations();
  }

  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }

  getNativeDatabase(): Database.Database {
    this.assertOpen();
    return this.db;
  }

  transaction<T>(fn: () => T): T {
    this.assertOpen();
    return this.db.transaction(fn)();
  }

  clearAllForTests(): void {
    this.assertOpen();
    this.db.exec(`
      DELETE FROM diagnostics;
      DELETE FROM tool_status;
      DELETE FROM reports;
      DELETE FROM event_markers;
      DELETE FROM metric_events_downsampled;
      DELETE FROM metric_events_raw;
      DELETE FROM sessions;
      DELETE FROM targets;
      DELETE FROM devices;
      DELETE FROM schema_migrations;
    `);
  }

  private applyPragmas(dbPath: string): void {
    this.db.pragma("foreign_keys = ON");

    if (dbPath !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }

    this.db.pragma("synchronous = NORMAL");
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("LumaTraceDatabase is closed.");
    }
  }
}

export { LumaTraceDatabase as Database };
