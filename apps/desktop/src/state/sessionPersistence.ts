import type { Session } from "../api/types";

export const LAST_SESSION_STORAGE_KEY = "lumatrace:last-session";

export interface PersistedSessionState {
  lastSessionId: string;
  deviceId: string;
  targetId: string;
  sessionName: string;
  profileName: "stable_60fps" | "janky_game" | "memory_growth";
  sampleIntervalMs: number;
  lastKnownStatus: Session["status"];
  updatedAt: number;
}

export function saveLastSession(state: PersistedSessionState, storage = localStorage): void {
  void state;
  clearLastSession(storage);
}

export function loadLastSession(storage = localStorage): PersistedSessionState | null {
  const raw = storage.getItem(LAST_SESSION_STORAGE_KEY);
  if (raw === null) {
    return null;
  }

  clearLastSession(storage);
  return null;
}

export function clearLastSession(storage = localStorage): void {
  storage.removeItem(LAST_SESSION_STORAGE_KEY);
}
