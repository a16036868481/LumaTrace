import { detectTauri, invokeTauri } from "./tauriClient";

export type WindowsFpsAccessState =
  | "ready"
  | "needs_setup"
  | "restart_required"
  | "unsupported"
  | "error";

export interface WindowsFpsAccessStatus {
  supported: boolean;
  state: WindowsFpsAccessState;
  ready: boolean;
  configured: boolean;
  requiresSignOut: boolean;
  canEnable: boolean;
  detailCode?: string;
}

const unsupportedStatus: WindowsFpsAccessStatus = {
  supported: false,
  state: "unsupported",
  ready: false,
  configured: false,
  requiresSignOut: false,
  canEnable: false
};

export async function getWindowsFpsAccessStatus(): Promise<WindowsFpsAccessStatus> {
  if (!detectTauri()) {
    return unsupportedStatus;
  }
  return invokeTauri<WindowsFpsAccessStatus>("get_windows_fps_access_status");
}

export async function enableWindowsFpsAccess(): Promise<WindowsFpsAccessStatus> {
  if (!detectTauri()) {
    return unsupportedStatus;
  }
  return invokeTauri<WindowsFpsAccessStatus>("enable_windows_fps_access");
}

export function isFpsAccessCancellation(error: unknown): boolean {
  return String(error).includes("fps_access_uac_cancelled");
}
