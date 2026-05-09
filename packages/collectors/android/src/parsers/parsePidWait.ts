import type { AndroidPidWaitResult } from "../lifecycle/AndroidLifecycleTypes";

export function createPidWaitResult(options: {
  pid?: number | null;
  attempts: number;
  durationMs: number;
  reason?: string;
}): AndroidPidWaitResult {
  const found = options.pid !== null && options.pid !== undefined && options.pid > 0;
  const result: AndroidPidWaitResult = {
    found,
    attempts: Math.max(0, options.attempts),
    durationMs: Math.max(0, options.durationMs)
  };
  if (found && typeof options.pid === "number") {
    result.pid = options.pid;
  }
  if (!found && options.reason !== undefined) {
    result.reason = options.reason;
  }
  return result;
}
