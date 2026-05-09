import type { ProcStatSnapshot } from "./parseProcStat";

export interface ProcPidStatSnapshot {
  pid: number;
  comm: string;
  state: string;
  utime: number;
  stime: number;
  cutime: number;
  cstime: number;
  starttime: number;
  totalProcessJiffies: number;
}

export interface CpuSample {
  rawPercent: number;
  normalizedPercent: number;
  processJiffiesDelta: number;
  systemJiffiesDelta: number;
  coreCount: number;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseProcPidStat(output: string): ProcPidStatSnapshot | null {
  const trimmed = output.trim();
  const firstParen = trimmed.indexOf("(");
  const lastParen = trimmed.lastIndexOf(")");
  if (firstParen < 1 || lastParen <= firstParen) {
    return null;
  }

  const pid = parseNumber(trimmed.slice(0, firstParen).trim());
  if (pid === null) {
    return null;
  }

  const comm = trimmed.slice(firstParen + 1, lastParen);
  const rest = trimmed.slice(lastParen + 1).trim().split(/\s+/u);
  const state = rest[0];
  const utime = parseNumber(rest[11]);
  const stime = parseNumber(rest[12]);
  const cutime = parseNumber(rest[13]) ?? 0;
  const cstime = parseNumber(rest[14]) ?? 0;
  const starttime = parseNumber(rest[19]);

  if (state === undefined || utime === null || stime === null || starttime === null) {
    return null;
  }

  return {
    pid,
    comm,
    state,
    utime,
    stime,
    cutime,
    cstime,
    starttime,
    totalProcessJiffies: utime + stime + cutime + cstime
  };
}

export function calculateProcessCpuPercent(
  previousProcess: ProcPidStatSnapshot,
  nextProcess: ProcPidStatSnapshot,
  previousSystem: ProcStatSnapshot,
  nextSystem: ProcStatSnapshot
): CpuSample | null {
  const processJiffiesDelta = nextProcess.totalProcessJiffies - previousProcess.totalProcessJiffies;
  const systemJiffiesDelta = nextSystem.totalJiffies - previousSystem.totalJiffies;
  const coreCount = nextSystem.coreCount || previousSystem.coreCount || 1;
  if (processJiffiesDelta < 0 || systemJiffiesDelta <= 0) {
    return null;
  }

  const normalizedPercent = (processJiffiesDelta / systemJiffiesDelta) * 100;
  return {
    rawPercent: normalizedPercent * coreCount,
    normalizedPercent,
    processJiffiesDelta,
    systemJiffiesDelta,
    coreCount
  };
}
