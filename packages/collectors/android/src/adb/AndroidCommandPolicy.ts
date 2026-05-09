import type { CommandResult, CommandRunnerOptions } from "@lumatrace/core";
import type { CommandRunnerLike } from "./AdbClient";
import type { AndroidDiagnosticCollector } from "../diagnostics/AndroidDiagnosticCollector";

export type AndroidCommandPolicyName =
  | "adb_version"
  | "adb_devices"
  | "getprop"
  | "pm_list_packages"
  | "dumpsys_package"
  | "proc_stat"
  | "proc_pid_stat"
  | "proc_pid_status"
  | "dumpsys_meminfo"
  | "dumpsys_battery"
  | "proc_net_dev"
  | "dumpsys_netstats_detail"
  | "gfxinfo"
  | "surfaceflinger_timestats"
  | "surfaceflinger_layers"
  | "surfaceflinger_latency"
  | "display"
  | "am_start"
  | "monkey"
  | "force_stop"
  | "default";

export interface AndroidCommandPolicy {
  name: AndroidCommandPolicyName;
  timeoutMs: number;
  maxOutputBytes: number;
  retryCount: number;
  retryable: boolean;
  sideEffect: boolean;
}

export interface RunAndroidCommandOptions
  extends Omit<CommandRunnerOptions, "timeoutMs" | "maxOutputBytes"> {
  timeoutMs?: number;
  maxOutputBytes?: number;
  policyName?: AndroidCommandPolicyName;
  diagnostics?: AndroidDiagnosticCollector;
  sessionId?: string;
  deviceId?: string;
  targetId?: string;
  packageName?: string;
}

const KIB = 1024;
const MIB = 1024 * KIB;

const DEFAULT_POLICIES: Record<AndroidCommandPolicyName, AndroidCommandPolicy> = {
  adb_version: { name: "adb_version", timeoutMs: 3000, maxOutputBytes: 256 * KIB, retryCount: 1, retryable: true, sideEffect: false },
  adb_devices: { name: "adb_devices", timeoutMs: 3000, maxOutputBytes: 256 * KIB, retryCount: 1, retryable: true, sideEffect: false },
  getprop: { name: "getprop", timeoutMs: 3000, maxOutputBytes: 1 * MIB, retryCount: 1, retryable: true, sideEffect: false },
  pm_list_packages: { name: "pm_list_packages", timeoutMs: 8000, maxOutputBytes: 2 * MIB, retryCount: 1, retryable: true, sideEffect: false },
  dumpsys_package: { name: "dumpsys_package", timeoutMs: 5000, maxOutputBytes: 3 * MIB, retryCount: 1, retryable: true, sideEffect: false },
  proc_stat: { name: "proc_stat", timeoutMs: 2000, maxOutputBytes: 128 * KIB, retryCount: 1, retryable: true, sideEffect: false },
  proc_pid_stat: { name: "proc_pid_stat", timeoutMs: 2000, maxOutputBytes: 128 * KIB, retryCount: 1, retryable: true, sideEffect: false },
  proc_pid_status: { name: "proc_pid_status", timeoutMs: 2000, maxOutputBytes: 128 * KIB, retryCount: 1, retryable: true, sideEffect: false },
  dumpsys_meminfo: { name: "dumpsys_meminfo", timeoutMs: 5000, maxOutputBytes: 2 * MIB, retryCount: 0, retryable: false, sideEffect: false },
  dumpsys_battery: { name: "dumpsys_battery", timeoutMs: 3000, maxOutputBytes: 256 * KIB, retryCount: 1, retryable: true, sideEffect: false },
  proc_net_dev: { name: "proc_net_dev", timeoutMs: 2000, maxOutputBytes: 256 * KIB, retryCount: 1, retryable: true, sideEffect: false },
  dumpsys_netstats_detail: { name: "dumpsys_netstats_detail", timeoutMs: 8000, maxOutputBytes: 5 * MIB, retryCount: 0, retryable: false, sideEffect: false },
  gfxinfo: { name: "gfxinfo", timeoutMs: 5000, maxOutputBytes: 3 * MIB, retryCount: 0, retryable: false, sideEffect: false },
  surfaceflinger_timestats: { name: "surfaceflinger_timestats", timeoutMs: 8000, maxOutputBytes: 10 * MIB, retryCount: 0, retryable: false, sideEffect: false },
  surfaceflinger_layers: { name: "surfaceflinger_layers", timeoutMs: 8000, maxOutputBytes: 5 * MIB, retryCount: 0, retryable: false, sideEffect: false },
  surfaceflinger_latency: { name: "surfaceflinger_latency", timeoutMs: 5000, maxOutputBytes: 512 * KIB, retryCount: 0, retryable: false, sideEffect: false },
  display: { name: "display", timeoutMs: 5000, maxOutputBytes: 2 * MIB, retryCount: 1, retryable: true, sideEffect: false },
  am_start: { name: "am_start", timeoutMs: 15000, maxOutputBytes: 256 * KIB, retryCount: 0, retryable: false, sideEffect: true },
  monkey: { name: "monkey", timeoutMs: 10000, maxOutputBytes: 256 * KIB, retryCount: 0, retryable: false, sideEffect: true },
  force_stop: { name: "force_stop", timeoutMs: 5000, maxOutputBytes: 128 * KIB, retryCount: 0, retryable: false, sideEffect: true },
  default: { name: "default", timeoutMs: 5000, maxOutputBytes: 1 * MIB, retryCount: 0, retryable: false, sideEffect: false }
};

export function getAndroidCommandPolicy(name: AndroidCommandPolicyName = "default"): AndroidCommandPolicy {
  return DEFAULT_POLICIES[name];
}

function isRetryableResult(result: CommandResult): boolean {
  return result.timedOut || result.aborted || result.exitCode === null;
}

function addCommandDiagnostic(
  options: RunAndroidCommandOptions,
  level: "debug" | "info" | "warn" | "error",
  code: "ADB_TIMEOUT" | "ADB_SLOW_COMMAND" | "ADB_COMMAND_RETRY" | "ADB_COMMAND_ABORTED",
  message: string,
  result: CommandResult,
  attempt: number
): void {
  const event = {
    level,
    category: "adb",
    code,
    message,
    sourceCommand: result.command,
    durationMs: result.durationMs,
    sanitizedCommand: result.sanitizedCommand,
    details: {
      policyName: options.policyName ?? "default",
      attempt,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      aborted: result.aborted,
      stdout: result.sanitizedStdout,
      stderr: result.sanitizedStderr
    }
  } as const;
  options.diagnostics?.add({
    ...event,
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    ...(options.deviceId === undefined ? {} : { deviceId: options.deviceId }),
    ...(options.targetId === undefined ? {} : { targetId: options.targetId }),
    ...(options.packageName === undefined ? {} : { packageName: options.packageName })
  });
}

export async function runAndroidCommandWithPolicy(
  runner: CommandRunnerLike,
  options: RunAndroidCommandOptions
): Promise<CommandResult> {
  const policy = getAndroidCommandPolicy(options.policyName);
  const timeoutMs = options.timeoutMs ?? policy.timeoutMs;
  const maxOutputBytes = options.maxOutputBytes ?? policy.maxOutputBytes;
  const attempts = policy.retryable && !policy.sideEffect ? policy.retryCount + 1 : 1;
  let lastResult: CommandResult | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await runner.run({
      ...options,
      timeoutMs,
      maxOutputBytes
    });
    lastResult = result;

    if (result.aborted) {
      addCommandDiagnostic(options, "warn", "ADB_COMMAND_ABORTED", "ADB command was aborted.", result, attempt);
      return result;
    }
    if (result.timedOut) {
      addCommandDiagnostic(options, "warn", "ADB_TIMEOUT", "ADB command timed out.", result, attempt);
    } else if (result.durationMs >= timeoutMs * 0.8) {
      addCommandDiagnostic(options, "warn", "ADB_SLOW_COMMAND", "ADB command was slow.", result, attempt);
    }

    if (attempt < attempts && isRetryableResult(result)) {
      addCommandDiagnostic(options, "info", "ADB_COMMAND_RETRY", "Retrying idempotent adb read command.", result, attempt);
      continue;
    }
    return result;
  }

  return lastResult as CommandResult;
}
