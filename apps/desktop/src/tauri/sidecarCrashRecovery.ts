import type { SidecarStatus } from "./sidecarStatus";
import { detectTauri, invokeTauri } from "./tauriClient";

export function getCooldownRemainingMs(status: SidecarStatus | null, now = Date.now()): number {
  if (status?.nextRestartAllowedAt === undefined) {
    return 0;
  }
  return Math.max(0, status.nextRestartAllowedAt - now);
}

export function isRestartDisabled(status: SidecarStatus | null, now = Date.now()): boolean {
  if (status === null) {
    return true;
  }
  const maxRestarts = status.maxRestarts ?? 3;
  return status.restartCount >= maxRestarts || getCooldownRemainingMs(status, now) > 0;
}

export async function getSidecarCrashState(): Promise<SidecarStatus> {
  if (!detectTauri()) {
    return {
      status: "unavailable",
      restartCount: 0,
      maxRestarts: 3,
      restartCooldownMs: 5000,
      message: "Sidecar crash recovery is available only in packaged mode."
    };
  }
  return invokeTauri<SidecarStatus>("get_sidecar_crash_state");
}

export async function clearSidecarCrashState(): Promise<SidecarStatus> {
  if (!detectTauri()) {
    return getSidecarCrashState();
  }
  return invokeTauri<SidecarStatus>("clear_sidecar_crash_state");
}
