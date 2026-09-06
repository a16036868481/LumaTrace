import { describe, expect, it, beforeEach } from "vitest";
import {
  clearSessionHistory,
  loadSessionHistory,
  removeSessionHistoryEntries,
  saveSessionHistoryEntry,
  SESSION_HISTORY_STORAGE_KEY
} from "../src/state/sessionHistoryPersistence";

beforeEach(() => {
  localStorage.clear();
});

describe("session history persistence", () => {
  it("saves, loads, updates status, and caps history at 20", () => {
    for (let index = 0; index < 25; index += 1) {
      saveSessionHistoryEntry({
        sessionId: `s${index}`,
        name: `Session ${index}`,
        deviceId: "d1",
        targetId: "t1",
        status: "created",
        updatedAt: index
      });
    }
    expect(loadSessionHistory()).toHaveLength(20);

    saveSessionHistoryEntry({
      sessionId: "s24",
      name: "Session 24",
      deviceId: "d1",
      targetId: "t1",
      status: "stopped",
      updatedAt: 100
    });
    expect(loadSessionHistory()[0]?.status).toBe("stopped");
  });

  it("ignores bad JSON and can clear", () => {
    localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, "{bad");
    expect(loadSessionHistory()).toEqual([]);
    expect(localStorage.getItem(SESSION_HISTORY_STORAGE_KEY)).toBeNull();

    saveSessionHistoryEntry({
      sessionId: "s1",
      name: "Safe",
      deviceId: "d1",
      targetId: "t1",
      status: "running",
      updatedAt: 1
    });
    clearSessionHistory();
    expect(loadSessionHistory()).toEqual([]);
  });

  it("does not persist secret-shaped fields", () => {
    saveSessionHistoryEntry({
      sessionId: "s1",
      name: "Safe",
      deviceId: "d1",
      targetId: "t1",
      status: "running",
      updatedAt: 1,
      // @ts-expect-error intentional hostile input
      token: "secret"
    });
    expect(localStorage.getItem(SESSION_HISTORY_STORAGE_KEY)).not.toContain("secret");
  });

  it("removes only the requested result history entries", () => {
    for (const sessionId of ["s1", "s2", "s3"]) {
      saveSessionHistoryEntry({
        sessionId,
        name: sessionId,
        deviceId: "d1",
        targetId: "t1",
        status: "stopped",
        updatedAt: Number(sessionId.slice(1))
      });
    }

    expect(removeSessionHistoryEntries(["s1", "s3"]).map((entry) => entry.sessionId)).toEqual([
      "s2"
    ]);
    expect(loadSessionHistory().map((entry) => entry.sessionId)).toEqual(["s2"]);

    removeSessionHistoryEntries(["s2"]);
    expect(loadSessionHistory()).toEqual([]);
    expect(localStorage.getItem(SESSION_HISTORY_STORAGE_KEY)).toBeNull();
  });
});
