import type { PackagedStatusResponse } from "../api/types";

export function summarizePackagedStorage(status: PackagedStatusResponse | null): string {
  const storage = status?.storage;
  if (storage === undefined) {
    return "Packaged storage status is unavailable in this mode.";
  }
  const db = storage.dbExists ? "db exists" : "db missing";
  const migrations = `migrations ${storage.migrationStatus}`;
  const sessions = storage.sessionsCount === undefined ? "sessions N/A" : `${storage.sessionsCount} sessions`;
  const reports = storage.reportsCount === undefined ? "reports N/A" : `${storage.reportsCount} reports`;
  return `${db}; ${migrations}; ${sessions}; ${reports}`;
}
