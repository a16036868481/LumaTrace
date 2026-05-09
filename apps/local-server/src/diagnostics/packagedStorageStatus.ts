import { accessSync, constants, existsSync, statSync } from "node:fs";
import type { LocalServerContext } from "../types";
import { sanitizePackagedPath } from "../config/packagedEnv";
import { sanitizePackagedDiagnosticText } from "./sanitizePackagedDiagnostics";

export type PackagedMigrationStatus = "unknown" | "ok" | "pending" | "failed";

export interface PackagedStorageStatus {
  dbExists: boolean;
  dbPathSanitized?: string;
  dbSizeBytes?: number;
  migrationStatus: PackagedMigrationStatus;
  migrationVersions: string[];
  lastMigrationAt?: number;
  sessionsCount?: number;
  reportsCount?: number;
  writable?: boolean;
  reportsDirExists: boolean;
  diagnosticsDirExists: boolean;
  reportsDirSanitized?: string;
  diagnosticsDirSanitized?: string;
  lastStorageError?: string;
  lastStorageErrorSanitized?: string;
}

interface MigrationRow {
  version: string;
  applied_at: number;
}

interface CountRow {
  count: number;
}

interface NativeDbLike {
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
  };
}

function countTable(db: NativeDbLike, tableName: string): number | undefined {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as CountRow | undefined;
  return row?.count;
}

function canWritePath(path: string | undefined): boolean | undefined {
  if (path === undefined) {
    return undefined;
  }
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function buildPackagedStorageStatus(context: LocalServerContext): PackagedStorageStatus {
  const dbPath = context.packaged.dbPath;
  const reportsDir = context.packaged.reportsDir;
  const diagnosticsDir = context.packaged.diagnosticsDir;
  const dbExists = dbPath === undefined ? false : dbPath === ":memory:" || existsSync(dbPath);
  const reportsDirExists = reportsDir === undefined ? false : existsSync(reportsDir);
  const diagnosticsDirExists = diagnosticsDir === undefined ? false : existsSync(diagnosticsDir);

  const dbPathSanitized = sanitizePackagedPath(dbPath);
  const reportsDirSanitized = sanitizePackagedPath(reportsDir);
  const diagnosticsDirSanitized = sanitizePackagedPath(diagnosticsDir);
  const writable = canWritePath(reportsDir);
  const base: PackagedStorageStatus = {
    dbExists,
    migrationStatus: "unknown",
    migrationVersions: [],
    reportsDirExists,
    diagnosticsDirExists,
    ...(dbPathSanitized === undefined ? {} : { dbPathSanitized }),
    ...(reportsDirSanitized === undefined ? {} : { reportsDirSanitized }),
    ...(diagnosticsDirSanitized === undefined ? {} : { diagnosticsDirSanitized }),
    ...(dbPath !== undefined && dbPath !== ":memory:" && dbExists ? { dbSizeBytes: statSync(dbPath).size } : {}),
    ...(writable === undefined ? {} : { writable })
  };

  try {
    const db = context.database.getNativeDatabase() as NativeDbLike;
    const migrations = db
      .prepare("SELECT version, applied_at FROM schema_migrations ORDER BY applied_at ASC, version ASC")
      .all() as MigrationRow[];
    const migrationVersions = migrations.map((row) => row.version);
    const lastMigrationAt = migrations.at(-1)?.applied_at;
    const sessionsCount = countTable(db, "sessions");
    const reportsCount = countTable(db, "reports");
    return {
      ...base,
      migrationStatus: migrationVersions.length > 0 ? "ok" : "pending",
      migrationVersions,
      ...(lastMigrationAt === undefined ? {} : { lastMigrationAt }),
      ...(sessionsCount === undefined ? {} : { sessionsCount }),
      ...(reportsCount === undefined ? {} : { reportsCount })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sanitizedError = sanitizePackagedDiagnosticText(message) ?? "<redacted>";
    return {
      ...base,
      migrationStatus: "failed",
      lastStorageError: sanitizedError,
      lastStorageErrorSanitized: sanitizedError
    };
  }
}
