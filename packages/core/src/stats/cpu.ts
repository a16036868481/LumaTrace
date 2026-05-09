import { average, maxValue } from "./percentiles";

export interface CpuTimes {
  idle: number;
  total: number;
}

export interface ProcessCpuSample {
  processTimeMs: number;
  wallTimeMs: number;
}

export interface ProcessCpuPercent {
  rawPercent: number;
  normalizedPercent: number;
  coreCount: number;
}

export interface CpuSummary {
  avgCpuPercent?: number;
  peakCpuPercent?: number;
}

export function calculateSystemCpuPercent(previous: CpuTimes, current: CpuTimes): number | undefined {
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;

  if (!Number.isFinite(totalDelta) || totalDelta <= 0 || !Number.isFinite(idleDelta)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
}

export function calculateProcessCpuPercent(
  previous: ProcessCpuSample,
  current: ProcessCpuSample,
  coreCount: number
): ProcessCpuPercent | undefined {
  const wallDelta = current.wallTimeMs - previous.wallTimeMs;
  const processDelta = current.processTimeMs - previous.processTimeMs;
  const safeCoreCount = Number.isFinite(coreCount) && coreCount > 0 ? coreCount : 1;

  if (!Number.isFinite(wallDelta) || wallDelta <= 0 || !Number.isFinite(processDelta)) {
    return undefined;
  }

  const rawPercent = Math.max(0, (processDelta / wallDelta) * 100);
  return {
    rawPercent,
    normalizedPercent: rawPercent / safeCoreCount,
    coreCount: safeCoreCount
  };
}

export function summarizeCpu(samples: readonly number[]): CpuSummary {
  const summary: CpuSummary = {};
  const avgCpuPercent = average(samples);
  const peakCpuPercent = maxValue(samples);

  if (avgCpuPercent !== undefined) {
    summary.avgCpuPercent = avgCpuPercent;
  }
  if (peakCpuPercent !== undefined) {
    summary.peakCpuPercent = peakCpuPercent;
  }

  return summary;
}
