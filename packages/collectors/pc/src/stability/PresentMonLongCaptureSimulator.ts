import type { MetricEvent } from "@lumatrace/core";
import type {
  PresentMonCaptureResult,
  PresentMonSessionCaptureOptions
} from "../windows/PresentMonCaptureRuntime";
import { PresentMonCaptureStatusTracker, type PresentMonCaptureStatusSnapshot } from "../windows/PresentMonCaptureStatus";

export interface PresentMonLongCaptureSimulatorOptions {
  metrics?: MetricEvent[];
  statusSequence?: PresentMonCaptureStatusSnapshot["status"][];
  resultStatus?: PresentMonCaptureResult["status"];
}

export class PresentMonLongCaptureSimulator {
  private readonly tracker = new PresentMonCaptureStatusTracker();
  private readonly metrics: MetricEvent[];
  private readonly statusSequence: PresentMonCaptureStatusSnapshot["status"][];
  private readonly resultStatus: PresentMonCaptureResult["status"];
  private aborted = false;

  constructor(options: PresentMonLongCaptureSimulatorOptions = {}) {
    this.metrics = options.metrics ?? [];
    this.statusSequence = options.statusSequence ?? [
      "planning",
      "starting",
      "capturing",
      "parsing_csv",
      "matching_target",
      "mapping_metrics",
      "completed"
    ];
    this.resultStatus = options.resultStatus ?? "success";
  }

  getStatus(): PresentMonCaptureStatusSnapshot {
    return this.tracker.getStatus();
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.tracker.update({ status: "aborted", reason: "Fake long capture aborted." });
  }

  async capture(options: PresentMonSessionCaptureOptions): Promise<PresentMonCaptureResult> {
    for (const status of this.statusSequence) {
      if (this.aborted) {
        break;
      }
      this.tracker.update({
        status,
        sessionId: options.sessionId,
        targetId: options.targetId,
        pid: options.target.pid,
        processName: options.target.name,
        captureDurationMs: options.captureDurationMs ?? 10000
      });
      await Promise.resolve();
    }
    if (this.aborted) {
      return {
        status: "aborted",
        rawRowCount: 0,
        matchedRowCount: 0,
        metrics: [],
        diagnostics: [],
        warnings: [],
        durationMs: 0,
        source: "PresentMon"
      };
    }
    return {
      status: this.resultStatus,
      rawRowCount: this.metrics.length,
      matchedRowCount: this.metrics.length,
      metrics: this.resultStatus === "success" ? this.metrics : [],
      diagnostics: [],
      warnings: this.resultStatus === "no_data" ? ["Fake no data."] : [],
      durationMs: options.captureDurationMs ?? 10000,
      source: "PresentMon"
    };
  }
}
