import { getMetrics } from "../api/endpoints";
import type { MetricEvent } from "../api/types";
import { useAsync } from "./useAsync";

export function useSessionMetrics(sessionId: string | null) {
  return useAsync<MetricEvent[]>(() => {
    if (sessionId === null || sessionId.length === 0) {
      return Promise.resolve([]);
    }
    return getMetrics(sessionId, { limit: 200 });
  }, [sessionId]);
}
