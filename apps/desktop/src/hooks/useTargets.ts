import { getTargets } from "../api/endpoints";
import type { Target } from "../api/types";
import { useAsync } from "./useAsync";

export function useTargets(deviceId: string | null) {
  return useAsync<Target[]>(() => {
    if (deviceId === null || deviceId.length === 0) {
      return Promise.resolve([]);
    }
    return getTargets(deviceId);
  }, [deviceId]);
}
