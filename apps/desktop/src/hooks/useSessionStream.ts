import { useEffect, useState } from "react";
import { normalizeApiError } from "../api/errors";
import type { ApiError } from "../api/errors";
import { createSessionWebSocket } from "../api/websocket";
import type { MetricEvent, Session } from "../api/types";

export interface SessionStreamState {
  metrics: MetricEvent[];
  status: Session["status"] | "idle";
  error: ApiError | null;
}

export function useSessionStream(sessionId: string | null, enabled: boolean): SessionStreamState {
  const [metrics, setMetrics] = useState<MetricEvent[]>([]);
  const [status, setStatus] = useState<SessionStreamState["status"]>("idle");
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!enabled || sessionId === null || sessionId.length === 0) {
      return undefined;
    }

    const handle = createSessionWebSocket(sessionId, {
      onMetric: (event) => {
        setMetrics((current) => [...current.slice(-99), event]);
      },
      onStatus: (nextStatus) => {
        setStatus(nextStatus);
      },
      onStopped: () => {
        setStatus("stopped");
      },
      onApiError: (apiError) => {
        setError(apiError);
      },
      onError: (caught) => {
        setError(normalizeApiError(caught));
      }
    });

    return () => {
      handle.close();
    };
  }, [enabled, sessionId]);

  return {
    metrics,
    status,
    error
  };
}
