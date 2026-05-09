import type { PidofParseResult } from "../types";

export function parsePidof(output: string): PidofParseResult {
  const pids = output
    .trim()
    .split(/\s+/u)
    .filter((token) => /^\d+$/u.test(token))
    .map((token) => Number.parseInt(token, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  return {
    pid: pids[0] ?? null,
    pids
  };
}
