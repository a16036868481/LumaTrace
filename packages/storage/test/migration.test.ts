import { describe, expect, it } from "vitest";
import { INITIAL_MIGRATION_VERSION, LumaTraceDatabase, TABLE_NAMES } from "../src";

interface NameRow {
  name: string;
}

interface MigrationRow {
  version: string;
}

describe("storage migrations", () => {
  it("creates all required tables in an in-memory database", () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const db = database.getNativeDatabase();

    try {
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as NameRow[];
      const tableNames = new Set(rows.map((row) => row.name));

      for (const tableName of TABLE_NAMES) {
        expect(tableNames.has(tableName)).toBe(true);
      }
    } finally {
      database.close();
    }
  });

  it("can run migrations repeatedly and records 001_initial once", () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const db = database.getNativeDatabase();

    try {
      database.migrate();
      database.migrate();

      const rows = db.prepare("SELECT version FROM schema_migrations").all() as MigrationRow[];
      expect(rows).toEqual([{ version: INITIAL_MIGRATION_VERSION }]);
    } finally {
      database.close();
    }
  });

  it("enables foreign keys", () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });

    try {
      const foreignKeys = database.getNativeDatabase().pragma("foreign_keys", {
        simple: true
      }) as number;
      expect(foreignKeys).toBe(1);
    } finally {
      database.close();
    }
  });
});
