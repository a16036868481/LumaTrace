import { getDevices } from "../api/endpoints";
import type { Device } from "../api/types";
import { useAsync } from "./useAsync";

export function useDevices() {
  return useAsync<Device[]>(() => getDevices(), []);
}
