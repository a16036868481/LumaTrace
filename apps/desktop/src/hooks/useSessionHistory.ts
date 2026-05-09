import { useCallback, useEffect, useState } from "react";
import { getSessions } from "../api/endpoints";
import type { Session } from "../api/types";
import {
  loadSessionHistory,
  saveSessionHistoryEntry,
  sessionToHistoryEntry,
  type PersistedSessionHistoryEntry
} from "../state/sessionHistoryPersistence";

export interface SessionHistoryItem extends PersistedSessionHistoryEntry {
  source: "server" | "local";
}

export function useSessionHistory(limit = 20) {
  const [items, setItems] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    const local = loadSessionHistory().map((item): SessionHistoryItem => ({ ...item, source: "local" }));
    try {
      const sessions = await getSessions({ limit });
      const serverItems = sessions.map((session): SessionHistoryItem => {
        const cached = local.find((item) => item.sessionId === session.id);
        const options: { targetName?: string; profileName?: string; updatedAt?: number } = {
          updatedAt: session.endedAt ?? session.startedAt ?? cached?.updatedAt ?? Date.now()
        };
        const profileName =
          typeof session.config?.profileName === "string" ? session.config.profileName : cached?.profileName;
        if (profileName !== undefined) {
          options.profileName = profileName;
        }
        if (cached?.targetName !== undefined) {
          options.targetName = cached.targetName;
        }
        return {
          ...sessionToHistoryEntry(session, options),
          source: "server"
        };
      });
      const merged = [
        ...serverItems,
        ...local.filter((item) => !serverItems.some((serverItem) => serverItem.sessionId === item.sessionId))
      ]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
      setItems(merged);
      setLocalOnly(false);
    } catch {
      setItems(local.slice(0, limit));
      setLocalOnly(true);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const remember = useCallback(
    (session: Session, options: { targetName?: string; profileName?: string } = {}): void => {
      saveSessionHistoryEntry(sessionToHistoryEntry(session, options));
      void refresh();
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    items,
    loading,
    localOnly,
    refresh,
    remember
  };
}
