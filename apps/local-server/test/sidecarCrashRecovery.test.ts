import { describe, expect, it } from "vitest";
import {
  canRestartSidecar,
  classifySidecarCrash,
  createSidecarCrashState,
  recordSidecarExit,
  recordSidecarRestartAttempt
} from "../src/diagnostics/sidecarCrashRecovery";

describe("sidecar crash recovery", () => {
  it("does not treat normal shutdown as a crash", () => {
    const state = createSidecarCrashState({ status: "running", restartCount: 1 });
    const next = recordSidecarExit(state, { exitCode: 0, expectedShutdown: true, now: 1000 });
    expect(next.status).toBe("shutdown_requested");
    expect(next.lastCrashReason).toBeUndefined();
  });

  it("classifies common crash reasons with sanitized evidence", () => {
    expect(classifySidecarCrash({ stderr: "EADDRINUSE C:\\Users\\Alice\\port.log" }).reasonCode).toBe(
      "port_conflict"
    );
    expect(classifySidecarCrash({ stderr: "AUTH_INVALID secret-token-123456789" }).reasonCode).toBe(
      "auth_failed"
    );
    expect(classifySidecarCrash({ stderr: "migration failed schema_migrations" }).reasonCode).toBe(
      "db_migration_failed"
    );
    const permission = classifySidecarCrash({ stderr: "permission denied /Users/alice/lumatrace.db" });
    expect(permission.reasonCode).toBe("permission_or_path_failed");
    expect(permission.sanitizedEvidence).not.toContain("/Users/alice");
  });

  it("records non-zero exits without leaking tokens", () => {
    const state = createSidecarCrashState({ status: "running" });
    const next = recordSidecarExit(state, {
      exitCode: 1,
      stderr: "AUTH_REQUIRED Bearer sidecar-token-123456789 C:\\Users\\Alice\\db.sqlite",
      now: 2000
    });
    expect(next.status).toBe("auth_failed");
    expect(next.lastCrashReason?.sanitizedEvidence).not.toContain("sidecar-token-123456789");
    expect(next.lastCrashReason?.sanitizedEvidence).not.toContain("C:\\Users\\Alice");
  });

  it("enforces restart cooldown and limit", () => {
    const state = createSidecarCrashState({ status: "crashed", restartCount: 0 }, {
      maxRestarts: 2,
      restartCooldownMs: 5000
    });
    const first = recordSidecarRestartAttempt(state, 1000);
    expect(first.restartCount).toBe(1);
    expect(canRestartSidecar(first, 2000)).toMatchObject({ ok: false, reason: "cooldown" });
    const second = recordSidecarRestartAttempt(first, 7000);
    expect(second.status).toBe("restart_limited");
    expect(canRestartSidecar(second, 13000)).toMatchObject({ ok: false, reason: "restart_limited" });
  });
});
