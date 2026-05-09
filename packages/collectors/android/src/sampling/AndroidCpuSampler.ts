import { CollectorError, METRIC_NAMES, METRIC_UNITS, type MetricEvent } from "@lumatrace/core";
import type { AndroidAdbClientLike } from "../types";
import {
  calculateProcessCpuPercent,
  type ProcPidStatSnapshot
} from "../parsers/parseProcPidStat";
import type { ProcStatSnapshot } from "../parsers/parseProcStat";
import { createAndroidMetricEvent, type AndroidSamplerContext } from "./AndroidSamplerTypes";

export interface AndroidCpuSamplerOptions {
  adbClient: AndroidAdbClientLike;
  context: AndroidSamplerContext;
}

export class AndroidCpuSampler {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly context: AndroidSamplerContext;
  private previousSystemSnapshot: ProcStatSnapshot | null = null;
  private previousProcessSnapshot: ProcPidStatSnapshot | null = null;

  constructor(options: AndroidCpuSamplerOptions) {
    this.adbClient = options.adbClient;
    this.context = options.context;
  }

  async sample(): Promise<MetricEvent[]> {
    const [systemSnapshot, processSnapshot] = await Promise.all([
      this.adbClient.readProcStat(this.context.serial),
      this.adbClient.readProcPidStat(this.context.serial, this.context.pid)
    ]);

    if (systemSnapshot === null || processSnapshot === null) {
      throw new CollectorError("Target process CPU counters are unavailable.", "COLLECTOR_ERROR", {
        collectorId: "android-adb"
      });
    }

    const previousSystem = this.previousSystemSnapshot;
    const previousProcess = this.previousProcessSnapshot;
    this.previousSystemSnapshot = systemSnapshot;
    this.previousProcessSnapshot = processSnapshot;

    if (previousSystem === null || previousProcess === null) {
      return [];
    }

    const cpuSample = calculateProcessCpuPercent(
      previousProcess,
      processSnapshot,
      previousSystem,
      systemSnapshot
    );
    if (cpuSample === null) {
      return [];
    }

    return [
      createAndroidMetricEvent({
        context: this.context,
        metricName: METRIC_NAMES.CPU_PERCENT,
        value: cpuSample.normalizedPercent,
        unit: METRIC_UNITS.PERCENT,
        source: "adb:/proc/stat+/proc/<pid>/stat",
        precision: "estimated",
        confidence: "medium",
        tags: {
          rawPercent: cpuSample.rawPercent,
          normalizedPercent: cpuSample.normalizedPercent,
          coreCount: cpuSample.coreCount,
          processJiffiesDelta: cpuSample.processJiffiesDelta,
          systemJiffiesDelta: cpuSample.systemJiffiesDelta,
          processName: processSnapshot.comm,
          sampler: "proc"
        }
      })
    ];
  }
}
