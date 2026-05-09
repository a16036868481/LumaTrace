import { METRIC_NAMES, METRIC_UNITS, type MetricEvent } from "@lumatrace/core";
import type { WindowsProcessAdapter, WindowsProcessCpuSnapshot, WindowsProcessInfo } from "../types";

export interface CpuSampleResult {
  rawPercent: number;
  normalizedPercent: number;
  processTimeDeltaMs: number;
  wallTimeDeltaMs: number;
  processorCount: number;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export function snapshotCpuFromProcess(process: WindowsProcessInfo, processorCount: number, timestampMs = Date.now()): WindowsProcessCpuSnapshot | null {
  if (process.kernelTimeMs === undefined || process.userTimeMs === undefined) {
    return null;
  }
  const snapshot: WindowsProcessCpuSnapshot = {
    pid: process.pid,
    processName: process.name,
    timestampMs,
    processKernelTimeMs: process.kernelTimeMs,
    processUserTimeMs: process.userTimeMs,
    processorCount
  };
  if (process.startTimeMs !== undefined) {
    snapshot.processStartTimeMs = process.startTimeMs;
  }
  return snapshot;
}

export function calculateWindowsCpuPercent(
  previous: WindowsProcessCpuSnapshot,
  next: WindowsProcessCpuSnapshot
): CpuSampleResult | null {
  if (
    previous.pid !== next.pid ||
    (previous.processStartTimeMs !== undefined &&
      next.processStartTimeMs !== undefined &&
      previous.processStartTimeMs !== next.processStartTimeMs)
  ) {
    return null;
  }
  const previousTime = previous.processKernelTimeMs + previous.processUserTimeMs;
  const nextTime = next.processKernelTimeMs + next.processUserTimeMs;
  const processTimeDeltaMs = nextTime - previousTime;
  const wallTimeDeltaMs = next.timestampMs - previous.timestampMs;
  if (wallTimeDeltaMs <= 0 || processTimeDeltaMs < 0) {
    return null;
  }
  const processorCount = Math.max(1, next.processorCount);
  const rawPercent = (processTimeDeltaMs / wallTimeDeltaMs) * 100;
  return {
    rawPercent,
    normalizedPercent: rawPercent / processorCount,
    processTimeDeltaMs,
    wallTimeDeltaMs,
    processorCount,
    confidence: "medium",
    warnings: []
  };
}

export interface WindowsCpuSamplerOptions {
  adapter: WindowsProcessAdapter;
  sessionId: string;
  deviceId: string;
  targetId: string;
  pid: number;
  processName: string;
  processorCount: number;
  nowMs?: () => number;
  nextSequence?: () => number;
}

export class WindowsCpuSampler {
  private readonly adapter: WindowsProcessAdapter;
  private readonly context: Required<Pick<WindowsCpuSamplerOptions, "nowMs" | "nextSequence">> &
    Omit<WindowsCpuSamplerOptions, "adapter" | "nowMs" | "nextSequence">;
  private previous: WindowsProcessCpuSnapshot | null = null;

  constructor(options: WindowsCpuSamplerOptions) {
    this.adapter = options.adapter;
    this.context = {
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      targetId: options.targetId,
      pid: options.pid,
      processName: options.processName,
      processorCount: options.processorCount,
      nowMs: options.nowMs ?? (() => Date.now()),
      nextSequence: options.nextSequence ?? (() => 0)
    };
  }

  resetBaseline(): void {
    this.previous = null;
  }

  async sample(): Promise<MetricEvent[]> {
    const process = await this.adapter.getProcess(this.context.pid);
    if (process === null) {
      return [];
    }
    const snapshot = snapshotCpuFromProcess(process, this.context.processorCount, this.context.nowMs());
    if (snapshot === null) {
      return [];
    }
    if (this.previous === null) {
      this.previous = snapshot;
      return [];
    }
    const sample = calculateWindowsCpuPercent(this.previous, snapshot);
    this.previous = snapshot;
    if (sample === null) {
      return [];
    }
    return [
      {
        sessionId: this.context.sessionId,
        timestampMs: snapshot.timestampMs,
        monotonicMs: snapshot.timestampMs,
        sequence: this.context.nextSequence(),
        deviceId: this.context.deviceId,
        targetId: this.context.targetId,
        metricName: METRIC_NAMES.CPU_PERCENT,
        value: sample.normalizedPercent,
        unit: METRIC_UNITS.PERCENT,
        source: "windows:process-times",
        precision: "estimated",
        confidence: sample.confidence,
        tags: {
          platform: "windows",
          pid: this.context.pid,
          processName: this.context.processName,
          rawPercent: sample.rawPercent,
          normalizedPercent: sample.normalizedPercent,
          processorCount: sample.processorCount,
          sampleWindowMs: sample.wallTimeDeltaMs,
          sampler: "process-times",
          ...(snapshot.processStartTimeMs === undefined ? {} : { processStartTimeMs: snapshot.processStartTimeMs })
        }
      }
    ];
  }
}
