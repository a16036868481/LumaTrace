import type { Session } from "../api/types";

export const SESSION_HISTORY_STORAGE_KEY = "lumatrace:session-history";
const MAX_HISTORY = 20;

export interface PersistedSessionHistoryEntry {
  sessionId: string;
  name: string;
  deviceId: string;
  targetId: string;
  targetName?: string;
  profileName?: string;
  status: Session["status"];
  startedAt?: number;
  endedAt?: number;
  updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeEntry(value: unknown): PersistedSessionHistoryEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.sessionId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.deviceId !== "string" ||
    typeof value.targetId !== "string" ||
    typeof value.status !== "string" ||
    typeof value.updatedAt !== "number"
  ) {
    return null;
  }

  const entry: PersistedSessionHistoryEntry = {
    sessionId: value.sessionId,
    name: value.name,
    deviceId: value.deviceId,
    targetId: value.targetId,
    status: value.status as Session["status"],
    updatedAt: value.updatedAt
  };

  if (typeof value.targetName === "string") {
    entry.targetName = value.targetName;
  }
  if (typeof value.profileName === "string") {
    entry.profileName = value.profileName;
  }
  if (typeof value.startedAt === "number") {
    entry.startedAt = value.startedAt;
  }
  if (typeof value.endedAt === "number") {
    entry.endedAt = value.endedAt;
  }

  return entry;
}

export function loadSessionHistory(storage: Storage = window.localStorage): PersistedSessionHistoryEntry[] {
  const raw = storage.getItem(SESSION_HISTORY_STORAGE_KEY);
  if (raw === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      storage.removeItem(SESSION_HISTORY_STORAGE_KEY);
      return [];
    }
    return parsed
      .map((item) => sanitizeEntry(item))
      .filter((item): item is PersistedSessionHistoryEntry => item !== null)
      .slice(0, MAX_HISTORY);
  } catch {
    storage.removeItem(SESSION_HISTORY_STORAGE_KEY);
    return [];
  }
}

export function saveSessionHistoryEntry(
  entry: PersistedSessionHistoryEntry,
  storage: Storage = window.localStorage
): PersistedSessionHistoryEntry[] {
  const sanitized: PersistedSessionHistoryEntry = {
    sessionId: entry.sessionId,
    name: entry.name,
    deviceId: entry.deviceId,
    targetId: entry.targetId,
    status: entry.status,
    updatedAt: entry.updatedAt
  };
  if (entry.targetName !== undefined) {
    sanitized.targetName = entry.targetName;
  }
  if (entry.profileName !== undefined) {
    sanitized.profileName = entry.profileName;
  }
  if (entry.startedAt !== undefined) {
    sanitized.startedAt = entry.startedAt;
  }
  if (entry.endedAt !== undefined) {
    sanitized.endedAt = entry.endedAt;
  }

  const next = [
    sanitized,
    ...loadSessionHistory(storage).filter((item) => item.sessionId !== sanitized.sessionId)
  ].slice(0, MAX_HISTORY);
  storage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearSessionHistory(storage: Storage = window.localStorage): void {
  storage.removeItem(SESSION_HISTORY_STORAGE_KEY);
}

export function sessionToHistoryEntry(
  session: Session,
  options: {
    targetName?: string;
    profileName?: string;
    updatedAt?: number;
  } = {}
): PersistedSessionHistoryEntry {
  const entry: PersistedSessionHistoryEntry = {
    sessionId: session.id,
    name: session.name,
    deviceId: session.deviceId,
    targetId: session.targetId,
    status: session.status,
    updatedAt: options.updatedAt ?? Date.now()
  };
  if (options.targetName !== undefined) {
    entry.targetName = options.targetName;
  }
  if (options.profileName !== undefined) {
    entry.profileName = options.profileName;
  }
  if (session.startedAt !== undefined) {
    entry.startedAt = session.startedAt;
  }
  if (session.endedAt !== undefined) {
    entry.endedAt = session.endedAt;
  }
  return entry;
}
