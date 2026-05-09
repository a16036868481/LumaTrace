import type { AndroidAdbClientLike } from "../types";
import type { AndroidProcessState } from "./AndroidLifecycleTypes";

export interface AndroidProcessWatcherOptions {
  adbClient: AndroidAdbClientLike;
  serial: string;
  packageName: string;
  initialPid: number;
  missingToleranceMs?: number;
  rebindTimeoutMs?: number;
  nowMs?: () => number;
}

export class AndroidProcessWatcher {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly serial: string;
  private readonly packageName: string;
  private readonly missingToleranceMs: number;
  private readonly rebindTimeoutMs: number;
  private readonly nowMs: () => number;
  private currentPid: number;
  private missingSinceMs: number | undefined;

  constructor(options: AndroidProcessWatcherOptions) {
    this.adbClient = options.adbClient;
    this.serial = options.serial;
    this.packageName = options.packageName;
    this.currentPid = options.initialPid;
    this.missingToleranceMs = options.missingToleranceMs ?? 1000;
    this.rebindTimeoutMs = options.rebindTimeoutMs ?? 10000;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  getCurrentPid(): number {
    return this.currentPid;
  }

  async check(): Promise<AndroidProcessState> {
    const timestampMs = this.nowMs();
    const pid = await this.adbClient.getPid(this.serial, this.packageName);
    if (pid === this.currentPid) {
      this.missingSinceMs = undefined;
      return {
        status: "running",
        pid,
        timestampMs
      };
    }

    if (pid === null) {
      this.missingSinceMs ??= timestampMs;
      const missingForMs = timestampMs - this.missingSinceMs;
      if (missingForMs > this.rebindTimeoutMs) {
        return {
          status: "stopped",
          previousPid: this.currentPid,
          reason: `Target process has been missing for ${missingForMs}ms.`,
          timestampMs
        };
      }
      return {
        status: "missing",
        previousPid: this.currentPid,
        reason:
          missingForMs < this.missingToleranceMs
            ? `Target process is temporarily missing for ${missingForMs}ms.`
            : `Target process is missing for ${missingForMs}ms.`,
        timestampMs
      };
    }

    const previousPid = this.currentPid;
    this.currentPid = pid;
    this.missingSinceMs = undefined;
    return {
      status: "rebound",
      pid,
      previousPid,
      reason: `Target process rebound from PID ${previousPid} to ${pid}.`,
      timestampMs
    };
  }
}
