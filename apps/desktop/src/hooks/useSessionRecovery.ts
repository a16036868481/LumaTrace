import { useCallback, useMemo, useState } from "react";
import { getSession } from "../api/endpoints";
import type { Session } from "../api/types";
import {
  clearLastSession,
  loadLastSession,
  saveLastSession,
  type PersistedSessionState
} from "../state/sessionPersistence";

export function useSessionRecovery() {
  const [persisted, setPersisted] = useState<PersistedSessionState | null>(() => loadLastSession());

  const save = useCallback((state: PersistedSessionState) => {
    saveLastSession(state);
    setPersisted(state);
  }, []);

  const clear = useCallback(() => {
    clearLastSession();
    setPersisted(null);
  }, []);

  const confirmSession = useCallback(async (): Promise<Session | null> => {
    if (persisted === null) {
      return null;
    }
    try {
      const session = await getSession(persisted.lastSessionId);
      save({
        ...persisted,
        lastKnownStatus: session.status,
        updatedAt: Date.now()
      });
      return session;
    } catch {
      return null;
    }
  }, [persisted, save]);

  return useMemo(
    () => ({
      persisted,
      save,
      clear,
      confirmSession
    }),
    [clear, confirmSession, persisted, save]
  );
}
