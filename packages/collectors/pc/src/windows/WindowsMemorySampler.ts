import { METRIC_NAMES, METRIC_UNITS, type MetricEvent } from "@lumatrace/core";
import type { WindowsMemorySnapshot, WindowsProcessAdapter, WindowsProcessInfo } from "../types";

function bytesToMegabytes(value: number): number {
  return value / 1024 / 1024;
}

export function snapshotMemoryFromProcess(process: WindowsProcessInfo, timestampMs = Date.now()): WindowsMemorySnapshot {
  const snapshot: WindowsMemorySnapshot = {
    pid: process.pid,
    processName: process.name,
    timestampMs
  };
  if (process.workingSetBytes !== undefined) {
    snapshot.workingSetBytes = process.workingSetBytes;
  }
  if (process.privateBytes !== undefined) {
    snapshot.privateBytes = process.privateBytes;
  }
  if (process.peakWorkingSetBytes !== undefined) {
    snapshot.peakWorkingSetBytes = process.peakWorkingSetBytes;
  }
  if (process.pagefileUsageBytes !== undefined) {
    snapshot.pagefileUsageBytes = process.pagefileUsageBytes;
  }
  if (process.startTimeMs !== undefined) {
    snapshot.processStartTimeMs = process.startTimeMs;
  }
  return snapshot;
}

export interface WindowsMemorySamplerOptions {
  adapter: WindowsProcessAdapter;
  sessionId: string;
  deviceId: string;
  targetId: string;
  pid: number;
  processName: string;
  nowMs?: () => number;
  nextSequence?: () => number;
}

export class WindowsMemorySampler {
  private readonly adapter: WindowsProcessAdapter;
  private readonly context: Required<Pick<WindowsMemorySamplerOptions, "nowMs" | "nextSequence">> &
    Omit<WindowsMemorySamplerOptions, "adapter" | "nowMs" | "nextSequence">;

  constructor(options: WindowsMemorySamplerOptions) {
    this.adapter = options.adapter;
    this.context = {
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      targetId: options.targetId,
      pid: options.pid,
      processName: options.processName,
      nowMs: options.nowMs ?? (() => Date.now()),
      nextSequence: options.nextSequence ?? (() => 0)
    };
  }

  async sample(): Promise<MetricEvent[]> {
    const process = await this.adapter.getProcess(this.context.pid);
    if (process === null || process.workingSetBytes === undefined) {
      return [];
    }
    const snapshot = snapshotMemoryFromProcess(process, this.context.nowMs());
    if (snapshot.workingSetBytes === undefined) {
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
        metricName: METRIC_NAMES.MEMORY_MB,
        value: bytesToMegabytes(snapshot.workingSetBytes),
        unit: METRIC_UNITS.MEGABYTES,
        source: "windows:process-memory",
        precision: "estimated",
        confidence: "high",
        tags: {
          platform: "windows",
          pid: this.context.pid,
          processName: this.context.processName,
          workingSetMb: bytesToMegabytes(snapshot.workingSetBytes),
          sampler: "process-memory",
          ...(snapshot.privateBytes === undefined ? {} : { privateBytesMb: bytesToMegabytes(snapshot.privateBytes) }),
          ...(snapshot.peakWorkingSetBytes === undefined ? {} : { peakWorkingSetMb: bytesToMegabytes(snapshot.peakWorkingSetBytes) }),
          ...(snapshot.pagefileUsageBytes === undefined ? {} : { pagefileUsageMb: bytesToMegabytes(snapshot.pagefileUsageBytes) }),
          ...(snapshot.processStartTimeMs === undefined ? {} : { processStartTimeMs: snapshot.processStartTimeMs })
        }
      }
    ];
  }
}
