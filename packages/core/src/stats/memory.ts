import { average, maxValue } from "./percentiles";

export interface MemorySummary {
  avgMemoryMb?: number;
  peakMemoryMb?: number;
}

export function bytesToMegabytes(bytes: number): number {
  if (!Number.isFinite(bytes)) {
    return 0;
  }

  return bytes / 1024 / 1024;
}

export function kilobytesToMegabytes(kilobytes: number): number {
  if (!Number.isFinite(kilobytes)) {
    return 0;
  }

  return kilobytes / 1024;
}

export function summarizeMemory(samplesMb: readonly number[]): MemorySummary {
  const summary: MemorySummary = {};
  const avgMemoryMb = average(samplesMb);
  const peakMemoryMb = maxValue(samplesMb);

  if (avgMemoryMb !== undefined) {
    summary.avgMemoryMb = avgMemoryMb;
  }
  if (peakMemoryMb !== undefined) {
    summary.peakMemoryMb = peakMemoryMb;
  }

  return summary;
}
