import type { MetricEvent } from "@lumatrace/core";
import type {
  PresentMonCaptureResult,
  PresentMonSessionCaptureOptions
} from "./PresentMonCaptureRuntime";
import type { PresentMonCaptureRuntimeLike } from "../types";

export interface PresentMonAdapter {
  startCapture(): Promise<void>;
  stopCapture(): Promise<MetricEvent[]>;
}

export class PresentMonExplicitCaptureAdapter {
  private capturePromise: Promise<PresentMonCaptureResult> | undefined;

  constructor(
    private readonly runtime: PresentMonCaptureRuntimeLike,
    private readonly options: PresentMonSessionCaptureOptions
  ) {}

  async startCapture(): Promise<void> {
    if (this.capturePromise !== undefined) {
      return;
    }
    this.capturePromise = this.runtime.capture(this.options);
  }

  async stopCapture(): Promise<MetricEvent[]> {
    if (this.capturePromise === undefined) {
      return [];
    }
    const result = await this.capturePromise;
    return result.metrics;
  }

  async abort(): Promise<void> {
    await this.runtime.abort();
  }
}

export class PresentMonCaptureNotImplemented implements PresentMonAdapter {
  async startCapture(): Promise<void> {
    throw new Error("PresentMon live capture is not implemented in Milestone 3A.");
  }

  async stopCapture(): Promise<MetricEvent[]> {
    return [];
  }
}
