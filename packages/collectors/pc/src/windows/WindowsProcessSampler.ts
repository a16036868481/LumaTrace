import type { MetricEvent } from "@lumatrace/core";
import type { WindowsProcessAdapter, WindowsProcessInfo } from "../types";
import { WindowsCpuSampler } from "./WindowsCpuSampler";
import { WindowsHardwareTelemetrySampler } from "./WindowsHardwareTelemetrySampler";
import type {
  WindowsHardwareTelemetryProviderLike,
  WindowsHardwareTelemetryWarning
} from "./WindowsHardwareTelemetryProvider";
import { WindowsMemorySampler } from "./WindowsMemorySampler";

export interface WindowsProcessSamplerOptions {
  adapter: WindowsProcessAdapter;
  sessionId: string;
  deviceId: string;
  targetId: string;
  process: WindowsProcessInfo;
  processorCount: number;
  hardwareTelemetryProvider?: WindowsHardwareTelemetryProviderLike;
  requestedMetrics?: readonly string[];
  onHardwareTelemetryWarning?: (warning: WindowsHardwareTelemetryWarning) => void;
  nowMs?: () => number;
}

export class WindowsProcessSampler {
  private readonly context: WindowsProcessSamplerOptions;
  private sequence = 0;
  private cpuSampler: WindowsCpuSampler;
  private memorySampler: WindowsMemorySampler;
  private hardwareTelemetrySampler: WindowsHardwareTelemetrySampler | undefined;

  constructor(options: WindowsProcessSamplerOptions) {
    this.context = options;
    this.cpuSampler = this.createCpuSampler(options.process.pid, options.process.name);
    this.memorySampler = this.createMemorySampler(options.process.pid, options.process.name);
    this.hardwareTelemetrySampler = this.createHardwareTelemetrySampler(options.process.pid, options.process.name);
  }

  rebindProcess(process: WindowsProcessInfo): void {
    this.cpuSampler = this.createCpuSampler(process.pid, process.name);
    this.memorySampler = this.createMemorySampler(process.pid, process.name);
    this.hardwareTelemetrySampler = this.createHardwareTelemetrySampler(process.pid, process.name);
  }

  async sample(): Promise<MetricEvent[]> {
    const events: MetricEvent[] = [];
    if (this.wants("cpu_percent")) {
      events.push(...(await this.cpuSampler.sample()));
    }
    if (this.wants("memory_mb")) {
      events.push(...(await this.memorySampler.sample()));
    }
    if (this.hardwareTelemetrySampler !== undefined) {
      events.push(...(await this.hardwareTelemetrySampler.sample()));
    }
    return events.sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
  }

  private createCpuSampler(pid: number, processName: string): WindowsCpuSampler {
    return new WindowsCpuSampler({
      adapter: this.context.adapter,
      sessionId: this.context.sessionId,
      deviceId: this.context.deviceId,
      targetId: this.context.targetId,
      pid,
      processName,
      processorCount: this.context.processorCount,
      ...(this.context.nowMs === undefined ? {} : { nowMs: this.context.nowMs }),
      nextSequence: () => ++this.sequence
    });
  }

  private createMemorySampler(pid: number, processName: string): WindowsMemorySampler {
    return new WindowsMemorySampler({
      adapter: this.context.adapter,
      sessionId: this.context.sessionId,
      deviceId: this.context.deviceId,
      targetId: this.context.targetId,
      pid,
      processName,
      ...(this.context.nowMs === undefined ? {} : { nowMs: this.context.nowMs }),
      nextSequence: () => ++this.sequence
    });
  }

  private createHardwareTelemetrySampler(
    pid: number,
    processName: string
  ): WindowsHardwareTelemetrySampler | undefined {
    if (this.context.hardwareTelemetryProvider === undefined) {
      return undefined;
    }
    return new WindowsHardwareTelemetrySampler({
      provider: this.context.hardwareTelemetryProvider,
      sessionId: this.context.sessionId,
      deviceId: this.context.deviceId,
      targetId: this.context.targetId,
      pid,
      processName,
      ...(this.context.requestedMetrics === undefined
        ? {}
        : { requestedMetrics: this.context.requestedMetrics }),
      ...(this.context.nowMs === undefined ? {} : { nowMs: this.context.nowMs }),
      nextSequence: () => ++this.sequence,
      ...(this.context.onHardwareTelemetryWarning === undefined
        ? {}
        : { onWarning: this.context.onHardwareTelemetryWarning })
    });
  }

  private wants(metricName: string): boolean {
    return (
      this.context.requestedMetrics === undefined ||
      this.context.requestedMetrics.includes(metricName)
    );
  }
}
