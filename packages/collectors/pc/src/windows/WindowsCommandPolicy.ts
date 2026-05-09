import type { CommandRunnerOptions } from "@lumatrace/core";

export interface WindowsCommandPolicy {
  timeoutMs: number;
  maxOutputBytes: number;
}

export const WINDOWS_COMMAND_POLICIES = {
  process_list: {
    timeoutMs: 8000,
    maxOutputBytes: 4 * 1024 * 1024
  },
  presentmon_version: {
    timeoutMs: 3000,
    maxOutputBytes: 256 * 1024
  },
  presentmon_help: {
    timeoutMs: 3000,
    maxOutputBytes: 512 * 1024
  },
  presentmon_capture: {
    timeoutMs: 125000,
    maxOutputBytes: 2 * 1024 * 1024
  }
} satisfies Record<string, WindowsCommandPolicy>;

export function applyWindowsCommandPolicy(
  options: Omit<CommandRunnerOptions, "timeoutMs"> & { timeoutMs?: number },
  policy: WindowsCommandPolicy
): CommandRunnerOptions {
  return {
    ...options,
    timeoutMs: options.timeoutMs ?? policy.timeoutMs,
    maxOutputBytes: options.maxOutputBytes ?? policy.maxOutputBytes
  };
}
