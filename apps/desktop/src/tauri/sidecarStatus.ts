import { detectTauri, invokeTauri } from "./tauriClient";

export interface SidecarStatus {
  status:
    | "starting"
    | "running"
    | "stopping"
    | "stopped"
    | "crashed"
    | "restart_limited"
    | "auth_failed"
    | "port_conflict"
    | "db_migration_failed"
    | "shutdown_requested"
    | "unavailable";
  pid?: number;
  port?: number;
  restartCount: number;
  lastExitCode?: number;
  startedAt?: number;
  exitedAt?: number;
  signal?: string;
  lastError?: string;
  lastStdoutExcerptSanitized?: string;
  lastStderrExcerptSanitized?: string;
  restartCooldownMs?: number;
  maxRestarts?: number;
  nextRestartAllowedAt?: number;
  lastCrashReason?: {
    reasonCode: string;
    userMessage: string;
    suggestedAction: string;
    severity: string;
    sanitizedEvidence?: string;
  };
  lastKnownPort?: number;
  lastKnownAuthRequired?: boolean;
  diagnosticsId?: string;
  artifactKind?: string;
  productionReady?: boolean;
  message?: string;
}

export async function getSidecarStatus(): Promise<SidecarStatus> {
  if (!detectTauri()) {
    return {
      status: "unavailable",
      restartCount: 0,
      message: "Tauri sidecar status is available only in packaged mode."
    };
  }
  return invokeTauri<SidecarStatus>("get_sidecar_status");
}
