import type { WindowsProcessAdapter, WindowsProcessInfo } from "../types";

export type WindowsProcessStatus = "running" | "exited" | "pid_reused" | "rebound" | "unknown";

export interface WindowsProcessState {
  status: WindowsProcessStatus;
  pid: number;
  previousPid?: number;
  processName?: string;
  reason?: string;
  timestampMs: number;
}

export interface WindowsProcessWatcherOptions {
  adapter: WindowsProcessAdapter;
  pid: number;
  processName: string;
  processStartTimeMs?: number;
  executablePath?: string;
  allowProcessRebindByName?: boolean;
  nowMs?: () => number;
}

function isSameIdentity(process: WindowsProcessInfo, expectedStartTimeMs?: number): boolean {
  if (expectedStartTimeMs === undefined || process.startTimeMs === undefined) {
    return true;
  }
  return process.startTimeMs === expectedStartTimeMs;
}

export class WindowsProcessWatcher {
  private readonly adapter: WindowsProcessAdapter;
  private readonly processName: string;
  private readonly executablePath: string | undefined;
  private readonly allowProcessRebindByName: boolean;
  private readonly nowMs: () => number;
  private currentPid: number;
  private processStartTimeMs: number | undefined;

  constructor(options: WindowsProcessWatcherOptions) {
    this.adapter = options.adapter;
    this.currentPid = options.pid;
    this.processName = options.processName;
    this.executablePath = options.executablePath;
    this.processStartTimeMs = options.processStartTimeMs;
    this.allowProcessRebindByName = options.allowProcessRebindByName === true;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  getCurrentPid(): number {
    return this.currentPid;
  }

  async check(): Promise<WindowsProcessState> {
    const timestampMs = this.nowMs();
    const process = await this.adapter.getProcess(this.currentPid);
    if (process !== null) {
      if (isSameIdentity(process, this.processStartTimeMs)) {
        return {
          status: "running",
          pid: this.currentPid,
          processName: process.name,
          timestampMs
        };
      }
      return {
        status: "pid_reused",
        pid: this.currentPid,
        processName: process.name,
        reason: "The PID exists, but process identity changed. Baseline was not reused.",
        timestampMs
      };
    }

    if (!this.allowProcessRebindByName) {
      return {
        status: "exited",
        pid: this.currentPid,
        processName: this.processName,
        reason: "Target process exited.",
        timestampMs
      };
    }

    const processes = await this.adapter.listProcesses();
    const rebound = processes.find((candidate) => {
      if (this.executablePath !== undefined && candidate.executablePath !== undefined) {
        return candidate.executablePath === this.executablePath;
      }
      return candidate.name === this.processName;
    });
    if (rebound === undefined) {
      return {
        status: "exited",
        pid: this.currentPid,
        processName: this.processName,
        reason: "Target process exited and no rebound candidate was found.",
        timestampMs
      };
    }

    const previousPid = this.currentPid;
    this.currentPid = rebound.pid;
    this.processStartTimeMs = rebound.startTimeMs;
    return {
      status: "rebound",
      pid: rebound.pid,
      previousPid,
      processName: rebound.name,
      reason: "Target process rebound by name/path. This is experimental.",
      timestampMs
    };
  }
}
