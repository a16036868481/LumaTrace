import type { CommandRunner, MetricEvent, Session, Target, ToolStatus } from "@lumatrace/core";
import type { PcDiagnosticsTimeline } from "./diagnostics/PcDiagnosticsTimeline";
import type {
  PresentMonCaptureResult,
  PresentMonSessionCaptureOptions,
  PresentMonToolLike
} from "./windows/PresentMonCaptureRuntime";
import type {
  PresentMonCaptureStatusListener,
  PresentMonCaptureStatusSnapshot
} from "./windows/PresentMonCaptureStatus";
import type { WindowsHardwareTelemetryProviderLike } from "./windows/WindowsHardwareTelemetryProvider";

export interface WindowsProcessInfo {
  pid: number;
  name: string;
  executablePath?: string;
  commandLine?: string;
  workingSetBytes?: number;
  privateBytes?: number;
  peakWorkingSetBytes?: number;
  pagefileUsageBytes?: number;
  kernelTimeMs?: number;
  userTimeMs?: number;
  startTimeMs?: number;
  iconDataUrl?: string;
  hasMainWindow?: boolean;
  parentPid?: number;
  architecture?: string;
  owner?: string;
  raw?: Record<string, unknown>;
}

export interface WindowsProcessListResult {
  processes: WindowsProcessInfo[];
  warnings: string[];
}

export interface WindowsProcessCpuSnapshot {
  pid: number;
  processName: string;
  timestampMs: number;
  processKernelTimeMs: number;
  processUserTimeMs: number;
  processorCount: number;
  processStartTimeMs?: number;
}

export interface WindowsMemorySnapshot {
  pid: number;
  processName: string;
  timestampMs: number;
  workingSetBytes?: number;
  privateBytes?: number;
  peakWorkingSetBytes?: number;
  pagefileUsageBytes?: number;
  processStartTimeMs?: number;
}

export interface WindowsProcessAdapter {
  listProcesses(): Promise<WindowsProcessInfo[]>;
  getProcess(pid: number): Promise<WindowsProcessInfo | null>;
}

export interface PcCollectorOptions {
  processAdapter?: WindowsProcessAdapter;
  commandRunner?: CommandRunner;
  platform?: NodeJS.Platform;
  presentMonPath?: string;
  processorCount?: number;
  diagnostics?: PcDiagnosticsTimeline;
  presentMonRuntimeFactory?: PresentMonCaptureRuntimeFactory;
  presentMonTempDir?: string;
  hardwareTelemetryProvider?: WindowsHardwareTelemetryProviderLike;
}

export interface PresentMonCaptureRuntimeLike {
  capture(options: PresentMonSessionCaptureOptions): Promise<PresentMonCaptureResult>;
  abort(): Promise<void>;
  getStatus?(): PresentMonCaptureStatusSnapshot;
  subscribeStatus?(listener: PresentMonCaptureStatusListener): () => void;
}

export interface PresentMonCaptureRuntimeFactoryOptions {
  commandRunner: CommandRunner;
  presentMonTool: PresentMonToolLike;
  diagnosticsTimeline: PcDiagnosticsTimeline;
  tempDir?: string;
  processLookup?: (pid: number) => Promise<WindowsProcessInfo | null>;
}

export type PresentMonCaptureRuntimeFactory = (
  options: PresentMonCaptureRuntimeFactoryOptions
) => PresentMonCaptureRuntimeLike;

export interface PcSessionRuntime {
  getSession(): Session;
  getStatus(): Session["status"];
  pause(): void;
  stop(): void;
  stream(): AsyncIterable<MetricEvent>;
}

export interface PresentMonVersionInfo {
  version?: string;
  rawOutput: string;
}

export interface PresentMonToolStatus {
  presentMonPath?: string;
  toolStatus: ToolStatus;
}

export function processRuntimeId(process: WindowsProcessInfo): string {
  return `${process.pid}-${process.startTimeMs ?? "unknown"}`;
}

export function processToTarget(process: WindowsProcessInfo): Target {
  const runtimeId = processRuntimeId(process);
  const tags: Record<string, string | number | boolean> = {
    processName: process.name,
    runtimeId,
    source: "windows:process-list"
  };
  if (process.startTimeMs !== undefined) {
    tags.startTimeMs = process.startTimeMs;
  }
  if (process.workingSetBytes !== undefined) {
    tags.workingSetMb = process.workingSetBytes / 1024 / 1024;
  }
  if (process.iconDataUrl !== undefined) {
    tags.iconDataUrl = process.iconDataUrl;
  }
  if (process.hasMainWindow !== undefined) {
    tags.hasMainWindow = process.hasMainWindow;
  }
  const target: Target = {
    id: `pc-windows-process:${process.pid}:${runtimeId}`,
    name: process.name,
    type: "process",
    pid: process.pid,
    platform: "windows",
    tags
  };
  if (process.executablePath !== undefined) {
    target.executablePath = process.executablePath;
  }
  return target;
}
