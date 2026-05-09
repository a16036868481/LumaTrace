import { METRIC_NAMES, METRIC_UNITS, type MetricEvent, type Tags } from "@lumatrace/core";
import type { AndroidAdbClientLike } from "../types";
import { createAndroidMetricEvent, type AndroidSamplerContext } from "./AndroidSamplerTypes";

export interface AndroidMemorySamplerOptions {
  adbClient: AndroidAdbClientLike;
  context: AndroidSamplerContext;
}

function addNumberTag(tags: Tags, key: string, value: number | undefined): void {
  if (value !== undefined) {
    tags[key] = value;
  }
}

export class AndroidMemorySampler {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly context: AndroidSamplerContext;

  constructor(options: AndroidMemorySamplerOptions) {
    this.adbClient = options.adbClient;
    this.context = options.context;
  }

  async sample(): Promise<MetricEvent[]> {
    const meminfo = await this.adbClient.readMeminfo(this.context.serial, this.context.packageName);
    if (!meminfo.unavailable && meminfo.totalPssMb !== undefined && meminfo.totalPssMb > 0) {
      const tags: Tags = {
        parserVersion: "android-meminfo-v1",
        sourceCommand: "dumpsys meminfo",
        sampler: "dumpsys_meminfo"
      };
      addNumberTag(tags, "totalPssMb", meminfo.totalPssMb);
      addNumberTag(tags, "nativeHeapMb", meminfo.nativeHeapMb);
      addNumberTag(tags, "dalvikHeapMb", meminfo.dalvikHeapMb);
      addNumberTag(tags, "javaHeapMb", meminfo.javaHeapMb);
      addNumberTag(tags, "privateDirtyMb", meminfo.privateDirtyMb);
      addNumberTag(tags, "swapPssMb", meminfo.swapPssMb);
      if (meminfo.warnings.length > 0) {
        tags.warningCount = meminfo.warnings.length;
      }

      return [
        createAndroidMetricEvent({
          context: this.context,
          metricName: METRIC_NAMES.MEMORY_MB,
          value: meminfo.totalPssMb,
          unit: METRIC_UNITS.MEGABYTES,
          source: "adb:dumpsys meminfo",
          precision: "estimated",
          confidence: meminfo.warnings.length > 0 ? "medium" : "high",
          parserVersion: "android-meminfo-v1",
          tags
        })
      ];
    }

    const procStatus = await this.adbClient.readProcStatus(this.context.serial, this.context.pid);
    if (procStatus?.rssMb === undefined || procStatus.rssMb <= 0) {
      return [];
    }

    const tags: Tags = {
      rssMb: procStatus.rssMb,
      fallback: true,
      fallbackReason: meminfo.unavailable ? "dumpsys meminfo unavailable" : "total PSS unavailable",
      sampler: "proc_status"
    };
    addNumberTag(tags, "vmSizeMb", procStatus.vmSizeMb);
    addNumberTag(tags, "rssAnonKb", procStatus.rssAnonKb);
    addNumberTag(tags, "rssFileKb", procStatus.rssFileKb);
    addNumberTag(tags, "rssShmemKb", procStatus.rssShmemKb);

    return [
      createAndroidMetricEvent({
        context: this.context,
        metricName: METRIC_NAMES.MEMORY_MB,
        value: procStatus.rssMb,
        unit: METRIC_UNITS.MEGABYTES,
        source: "adb:/proc/<pid>/status",
        precision: "estimated",
        confidence: "low",
        parserVersion: "android-proc-status-v1",
        tags
      })
    ];
  }
}
