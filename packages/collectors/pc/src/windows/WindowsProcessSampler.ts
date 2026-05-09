import type { MetricEvent } from "@lumatrace/core";
import type { WindowsProcessAdapter, WindowsProcessInfo } from "../types";
import { WindowsCpuSampler } from "./WindowsCpuSampler";
import { WindowsMemorySampler } from "./WindowsMemorySampler";

export interface WindowsProcessSamplerOptions {
  adapter: WindowsProcessAdapter;
  sessionId: string;
  deviceId: string;
  targetId: string;
  process: WindowsProcessInfo;
  processorCount: number;
  nowMs?: () => number;
}

export class WindowsProcessSampler {
  private readonly context: WindowsProcessSamplerOptions;
  private sequence = 0;
  private cpuSampler: WindowsCpuSampler;
  private memorySampler: WindowsMemorySampler;

  constructor(options: WindowsProcessSamplerOptions) {
    this.context = options;
    this.cpuSampler = this.createCpuSampler(options.process.pid, options.process.name);
    this.memorySampler = this.createMemorySampler(options.process.pid, options.process.name);
  }

  rebindProcess(process: WindowsProcessInfo): void {
    this.cpuSampler = this.createCpuSampler(process.pid, process.name);
    this.memorySampler = this.createMemorySampler(process.pid, process.name);
  }

  async sample(): Promise<MetricEvent[]> {
    const events: MetricEvent[] = [];
    events.push(...(await this.cpuSampler.sample()));
    events.push(...(await this.memorySampler.sample()));
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
}
