import { sanitizePackagedDiagnosticText } from "./sanitizePackagedDiagnostics";

export type SidecarCrashStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "restart_limited"
  | "auth_failed"
  | "port_conflict"
  | "db_migration_failed"
  | "shutdown_requested";

export type SidecarCrashReasonCode =
  | "port_conflict"
  | "auth_failed"
  | "db_migration_failed"
  | "permission_or_path_failed"
  | "unknown";

export interface SidecarCrashReason {
  reasonCode: SidecarCrashReasonCode;
  userMessage: string;
  suggestedAction: string;
  severity: "info" | "warn" | "error";
  sanitizedEvidence?: string;
}

export interface SidecarCrashState {
  status: SidecarCrashStatus;
  pid?: number;
  startedAt?: number;
  exitedAt?: number;
  exitCode?: number;
  signal?: string;
  restartCount: number;
  maxRestarts: number;
  restartCooldownMs: number;
  nextRestartAllowedAt?: number;
  lastError?: string;
  lastStdoutExcerptSanitized?: string;
  lastStderrExcerptSanitized?: string;
  lastCrashReason?: SidecarCrashReason;
  lastKnownPort?: number;
  lastKnownAuthRequired?: boolean;
  diagnosticsId?: string;
}

export interface SidecarCrashRecoveryPolicy {
  maxRestarts: number;
  restartCooldownMs: number;
}

export const DEFAULT_SIDECAR_CRASH_POLICY: SidecarCrashRecoveryPolicy = {
  maxRestarts: 3,
  restartCooldownMs: 5000
};

function evidenceText(parts: Array<string | number | undefined>): string {
  const joined = parts
    .filter((part): part is string | number => part !== undefined)
    .map((part) => String(part))
    .join("\n");
  return (sanitizePackagedDiagnosticText(joined) ?? "").slice(0, 4096);
}

export function classifySidecarCrash(input: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  startupError?: string;
  packagedStatusError?: string;
}): SidecarCrashReason {
  const evidence = evidenceText([
    input.exitCode === undefined ? undefined : `exitCode=${input.exitCode}`,
    input.stdout,
    input.stderr,
    input.startupError,
    input.packagedStatusError
  ]);
  const normalized = evidence.toLowerCase();

  if (/eaddrinuse|address already in use/u.test(normalized)) {
    return {
      reasonCode: "port_conflict",
      userMessage: "The local-server sidecar could not bind its localhost port.",
      suggestedAction: "Restart the sidecar after closing the process that owns the port.",
      severity: "error",
      sanitizedEvidence: evidence
    };
  }
  if (/auth_required|auth_invalid|missing auth token|requires a local auth token/u.test(normalized)) {
    return {
      reasonCode: "auth_failed",
      userMessage: "The local-server sidecar rejected or missed its local auth token.",
      suggestedAction: "Restart the sidecar from the packaged app so a fresh in-memory token is passed.",
      severity: "error",
      sanitizedEvidence: evidence
    };
  }
  if (/migration failed|schema_migrations|sqlite open error|database schema/u.test(normalized)) {
    return {
      reasonCode: "db_migration_failed",
      userMessage: "The packaged database migration or schema check failed.",
      suggestedAction: "Export packaging diagnostics before resetting local packaged data.",
      severity: "error",
      sanitizedEvidence: evidence
    };
  }
  if (/permission denied|access denied|cannot open database|eperm|eacces/u.test(normalized)) {
    return {
      reasonCode: "permission_or_path_failed",
      userMessage: "The sidecar could not access a required packaged path.",
      suggestedAction: "Check application data directory permissions and retry.",
      severity: "error",
      sanitizedEvidence: evidence
    };
  }

  return {
    reasonCode: "unknown",
    userMessage: "The local-server sidecar exited unexpectedly.",
    suggestedAction: "Export packaging diagnostics and restart the sidecar.",
    severity: "error",
    sanitizedEvidence: evidence
  };
}

function statusForReason(reason: SidecarCrashReason): SidecarCrashStatus {
  if (
    reason.reasonCode === "port_conflict" ||
    reason.reasonCode === "auth_failed" ||
    reason.reasonCode === "db_migration_failed"
  ) {
    return reason.reasonCode;
  }
  return "crashed";
}

type SidecarCrashStateInput = {
  [K in keyof SidecarCrashState]?: SidecarCrashState[K] | undefined;
};

export function createSidecarCrashState(
  input: SidecarCrashStateInput = {},
  policy: SidecarCrashRecoveryPolicy = DEFAULT_SIDECAR_CRASH_POLICY
): SidecarCrashState {
  return {
    status: input.status ?? "stopped",
    restartCount: input.restartCount ?? 0,
    maxRestarts: input.maxRestarts ?? policy.maxRestarts,
    restartCooldownMs: input.restartCooldownMs ?? policy.restartCooldownMs,
    ...(input.pid === undefined ? {} : { pid: input.pid }),
    ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
    ...(input.exitedAt === undefined ? {} : { exitedAt: input.exitedAt }),
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.nextRestartAllowedAt === undefined ? {} : { nextRestartAllowedAt: input.nextRestartAllowedAt }),
    ...(input.lastError === undefined
      ? {}
      : { lastError: sanitizePackagedDiagnosticText(input.lastError) ?? "<redacted>" }),
    ...(input.lastStdoutExcerptSanitized === undefined
      ? {}
      : {
          lastStdoutExcerptSanitized:
            sanitizePackagedDiagnosticText(input.lastStdoutExcerptSanitized) ?? "<redacted>"
        }),
    ...(input.lastStderrExcerptSanitized === undefined
      ? {}
      : {
          lastStderrExcerptSanitized:
            sanitizePackagedDiagnosticText(input.lastStderrExcerptSanitized) ?? "<redacted>"
        }),
    ...(input.lastCrashReason === undefined ? {} : { lastCrashReason: input.lastCrashReason }),
    ...(input.lastKnownPort === undefined ? {} : { lastKnownPort: input.lastKnownPort }),
    ...(input.lastKnownAuthRequired === undefined ? {} : { lastKnownAuthRequired: input.lastKnownAuthRequired }),
    ...(input.diagnosticsId === undefined ? {} : { diagnosticsId: input.diagnosticsId })
  };
}

export function recordSidecarExit(
  state: SidecarCrashState,
  input: {
    exitCode?: number;
    signal?: string;
    stdout?: string;
    stderr?: string;
    expectedShutdown?: boolean;
    now?: number;
  }
): SidecarCrashState {
  const now = input.now ?? Date.now();
  if (input.expectedShutdown === true || input.exitCode === 0) {
    return createSidecarCrashState({
      status: input.expectedShutdown === true ? "shutdown_requested" : "stopped",
      restartCount: state.restartCount,
      maxRestarts: state.maxRestarts,
      restartCooldownMs: state.restartCooldownMs,
      ...(state.nextRestartAllowedAt === undefined ? {} : { nextRestartAllowedAt: state.nextRestartAllowedAt }),
      ...(state.lastKnownPort === undefined ? {} : { lastKnownPort: state.lastKnownPort }),
      ...(state.lastKnownAuthRequired === undefined
        ? {}
        : { lastKnownAuthRequired: state.lastKnownAuthRequired }),
      exitedAt: now,
      ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.stdout === undefined ? {} : { lastStdoutExcerptSanitized: input.stdout }),
      ...(input.stderr === undefined ? {} : { lastStderrExcerptSanitized: input.stderr })
    });
  }

  const reason = classifySidecarCrash(input);
  return createSidecarCrashState({
    ...state,
    status: statusForReason(reason),
    exitedAt: now,
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    lastError: reason.userMessage,
    lastCrashReason: reason,
    ...(input.stdout === undefined ? {} : { lastStdoutExcerptSanitized: input.stdout }),
    ...(input.stderr === undefined ? {} : { lastStderrExcerptSanitized: input.stderr })
  });
}

export function canRestartSidecar(
  state: SidecarCrashState,
  now = Date.now()
): { ok: boolean; reason?: "cooldown" | "restart_limited"; nextRestartAllowedAt?: number } {
  if (state.restartCount >= state.maxRestarts) {
    return { ok: false, reason: "restart_limited" };
  }
  if (state.nextRestartAllowedAt !== undefined && now < state.nextRestartAllowedAt) {
    return {
      ok: false,
      reason: "cooldown",
      nextRestartAllowedAt: state.nextRestartAllowedAt
    };
  }
  return { ok: true };
}

export function recordSidecarRestartAttempt(state: SidecarCrashState, now = Date.now()): SidecarCrashState {
  const eligibility = canRestartSidecar(state, now);
  if (!eligibility.ok) {
    return createSidecarCrashState({
      ...state,
      status: eligibility.reason === "restart_limited" ? "restart_limited" : state.status,
      ...(eligibility.nextRestartAllowedAt === undefined
        ? {}
        : { nextRestartAllowedAt: eligibility.nextRestartAllowedAt })
    });
  }

  const restartCount = state.restartCount + 1;
  return createSidecarCrashState({
    ...state,
    status: restartCount >= state.maxRestarts ? "restart_limited" : "starting",
    restartCount,
    nextRestartAllowedAt: now + state.restartCooldownMs
  });
}

export function clearSidecarCrashState(
  state: SidecarCrashState,
  policy: SidecarCrashRecoveryPolicy = DEFAULT_SIDECAR_CRASH_POLICY
): SidecarCrashState {
  return createSidecarCrashState(
    {
      status: state.status === "running" ? "running" : "stopped",
      ...(state.pid === undefined ? {} : { pid: state.pid }),
      ...(state.startedAt === undefined ? {} : { startedAt: state.startedAt }),
      ...(state.lastKnownPort === undefined ? {} : { lastKnownPort: state.lastKnownPort }),
      ...(state.lastKnownAuthRequired === undefined
        ? {}
        : { lastKnownAuthRequired: state.lastKnownAuthRequired })
    },
    policy
  );
}
