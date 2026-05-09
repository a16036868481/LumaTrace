import type { SidecarStatus } from "../tauri/sidecarStatus";
import { getCooldownRemainingMs, isRestartDisabled } from "../tauri/sidecarCrashRecovery";
import { RestartSidecarButton } from "./RestartSidecarButton";
import { SidecarCrashStateBadge } from "./SidecarCrashStateBadge";

interface SidecarCrashRecoveryPanelProps {
  status: SidecarStatus | null;
  onRestart?: () => void;
  onClear?: () => void;
}

export function SidecarCrashRecoveryPanel({ status, onRestart, onClear }: SidecarCrashRecoveryPanelProps) {
  const cooldownRemainingMs = getCooldownRemainingMs(status);
  const maxRestarts = status?.maxRestarts ?? 3;
  const restartDisabled = isRestartDisabled(status);

  return (
    <section className="panel" aria-label="Sidecar crash recovery">
      <h2>Sidecar Crash Recovery</h2>
      {status === null ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <SidecarCrashStateBadge status={status} />
            <span className="status-pill">restart count: {status.restartCount}</span>
            <span className="status-pill">restart limit: {maxRestarts}</span>
            <span className="status-pill">cooldown remaining: {cooldownRemainingMs}ms</span>
            <span className="status-pill">artifact: {status.artifactKind ?? "unknown"}</span>
          </div>
          <p className="notice-text">
            {status.lastCrashReason?.userMessage ??
              status.lastError ??
              status.message ??
              "Sidecar restarts are limited and never expose the local auth token."}
          </p>
          {status.lastCrashReason?.suggestedAction !== undefined ? (
            <p className="notice-text">{status.lastCrashReason.suggestedAction}</p>
          ) : null}
          {status.lastStderrExcerptSanitized !== undefined ? (
            <pre className="code-block">{status.lastStderrExcerptSanitized}</pre>
          ) : null}
          {status.status === "restart_limited" ? (
            <p className="notice-text">Restart limit reached. Open logs or export packaging diagnostics before retrying.</p>
          ) : null}
          {onRestart !== undefined ? (
            <RestartSidecarButton disabled={restartDisabled} onRestart={onRestart} />
          ) : null}
          {onClear !== undefined ? (
            <button className="button button-secondary" type="button" onClick={onClear}>
              Clear crash state
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
