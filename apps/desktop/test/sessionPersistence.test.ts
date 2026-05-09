import { describe, expect, it } from "vitest";
import {
  clearLastSession,
  LAST_SESSION_STORAGE_KEY,
  loadLastSession,
  saveLastSession
} from "../src/state/sessionPersistence";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("session persistence", () => {
  it("keeps last-session recovery disabled", () => {
    const storage = new MemoryStorage();
    saveLastSession(
      {
        lastSessionId: "s1",
        deviceId: "d1",
        targetId: "t1",
        sessionName: "Session",
        profileName: "janky_game",
        sampleIntervalMs: 100,
        lastKnownStatus: "running",
        updatedAt: 123
      },
      storage
    );

    expect(loadLastSession(storage)).toBeNull();
    expect(storage.getItem(LAST_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("clears legacy saved last session data", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LAST_SESSION_STORAGE_KEY,
      JSON.stringify({
        lastSessionId: "s1",
        deviceId: "d1",
        targetId: "t1",
        sessionName: "Session",
        profileName: "janky_game",
        sampleIntervalMs: 100,
        lastKnownStatus: "running",
        updatedAt: 123
      })
    );

    expect(loadLastSession(storage)).toBeNull();
    clearLastSession(storage);
    expect(loadLastSession(storage)).toBeNull();
  });

  it("clears bad JSON safely", () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_SESSION_STORAGE_KEY, "{bad");

    expect(loadLastSession(storage)).toBeNull();
    expect(storage.getItem(LAST_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("does not persist secret-like fields", () => {
    const storage = new MemoryStorage();
    saveLastSession(
      {
        lastSessionId: "s1",
        deviceId: "d1",
        targetId: "t1",
        sessionName: "Session",
        profileName: "stable_60fps",
        sampleIntervalMs: 100,
        lastKnownStatus: "created",
        updatedAt: 123
      },
      storage
    );

    const raw = storage.getItem(LAST_SESSION_STORAGE_KEY) ?? "";
    expect(raw).toBe("");
    expect(raw).not.toContain("token");
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("cookie");
  });
});
