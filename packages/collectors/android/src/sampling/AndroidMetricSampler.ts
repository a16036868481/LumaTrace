import type { MetricEvent } from "@lumatrace/core";
import type { AndroidAdbClientLike } from "../types";
import { AndroidBatterySampler } from "./AndroidBatterySampler";
import { AndroidCpuSampler } from "./AndroidCpuSampler";
import { AndroidMemorySampler } from "./AndroidMemorySampler";
import { AndroidNetworkSampler } from "./AndroidNetworkSampler";
import type { AndroidSamplerContext } from "./AndroidSamplerTypes";

export interface AndroidSampler {
  sample(): Promise<MetricEvent[]>;
}

export interface AndroidMetricSamplerOptions {
  adbClient: AndroidAdbClientLike;
  context: AndroidSamplerContext;
  uid?: number;
  samplers?: AndroidSampler[];
}

export interface AndroidMetricSampleOptions {
  processMissing?: boolean;
}

export interface AndroidSamplerError {
  sampler: string;
  message: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AndroidMetricSampler {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly context: AndroidSamplerContext;
  private readonly uid: number | undefined;
  private processSamplers: AndroidSampler[];
  private readonly deviceSamplers: AndroidSampler[];
  private lastErrors: AndroidSamplerError[] = [];

  constructor(options: AndroidMetricSamplerOptions) {
    this.adbClient = options.adbClient;
    this.context = options.context;
    this.uid = options.uid;
    if (options.samplers !== undefined) {
      this.processSamplers = options.samplers;
      this.deviceSamplers = [];
    } else {
      this.processSamplers = this.createProcessSamplers();
      this.deviceSamplers = this.createDeviceSamplers();
    }
  }

  async sample(options: AndroidMetricSampleOptions = {}): Promise<MetricEvent[]> {
    const events: MetricEvent[] = [];
    const errors: AndroidSamplerError[] = [];
    const samplers = options.processMissing === true ? this.deviceSamplers : [...this.processSamplers, ...this.deviceSamplers];

    for (const sampler of samplers) {
      try {
        const sampled = await sampler.sample();
        if (options.processMissing === true) {
          for (const event of sampled) {
            event.tags = {
              ...(event.tags ?? {}),
              processMissing: true
            };
            events.push(event);
          }
        } else {
          events.push(...sampled);
        }
      } catch (error) {
        errors.push({
          sampler: sampler.constructor.name || "AndroidSampler",
          message: errorMessage(error)
        });
      }
    }

    this.lastErrors = errors;
    return events;
  }

  consumeErrors(): AndroidSamplerError[] {
    const errors = this.lastErrors;
    this.lastErrors = [];
    return errors;
  }

  rebindProcess(pid: number): void {
    this.context.pid = pid;
    this.processSamplers = this.createProcessSamplers();
  }

  private createProcessSamplers(): AndroidSampler[] {
    return [
      new AndroidCpuSampler({ adbClient: this.adbClient, context: this.context }),
      new AndroidMemorySampler({ adbClient: this.adbClient, context: this.context })
    ];
  }

  private createDeviceSamplers(): AndroidSampler[] {
    return [
      new AndroidBatterySampler({ adbClient: this.adbClient, context: this.context }),
      new AndroidNetworkSampler({
        adbClient: this.adbClient,
        context: this.context,
        ...(this.uid === undefined ? {} : { uid: this.uid })
      })
    ];
  }
}
