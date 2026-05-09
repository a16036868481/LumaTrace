import type { CommandRunner, MetricEvent, ToolStatus } from "@lumatrace/core";

export interface IosDeviceInfo {
  udid: string;
  name: string;
  osVersion?: string;
  deviceType: "device" | "simulator";
  state?: string;
  rawLine?: string;
}

export interface IosAppInfo {
  bundleId: string;
  name?: string;
  displayName?: string;
  applicationType?: string;
  raw?: Record<string, unknown>;
}

export interface IosToolStatus {
  toolStatus: ToolStatus;
  xcrunPath?: string;
}

export interface IosToolClient {
  getToolStatus(): Promise<IosToolStatus>;
  listDevices(): Promise<IosDeviceInfo[]>;
  listSimulatorApps(udid: string): Promise<IosAppInfo[]>;
}

export interface IosCollectorOptions {
  commandRunner?: CommandRunner;
  toolClient?: IosToolClient;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  xcrunPath?: string;
}

export interface IosTraceCsvRow {
  rowNumber: number;
  timestampMs?: number;
  processName?: string;
  bundleId?: string;
  pid?: number;
  fps?: number;
  frameTimeMs?: number;
  cpuPercent?: number;
  memoryMb?: number;
  raw: Record<string, string>;
}

export interface ParseXctraceCsvResult {
  rows: IosTraceCsvRow[];
  warnings: string[];
  detectedColumns: string[];
  rowCount: number;
  parserVersion: "ios-xctrace-csv-v1";
}

export interface IosTraceTargetDescriptor {
  bundleId?: string;
  processName?: string;
  pid?: number;
}

export interface IosTraceMatchResult {
  status: "matched" | "no_match" | "ambiguous";
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
  matchedRows: IosTraceCsvRow[];
  candidates: Array<{
    bundleId?: string;
    processName?: string;
    pid?: number;
    rowCount: number;
  }>;
}

export interface IosTraceMetricMappingOptions {
  sessionId: string;
  deviceId: string;
  targetId: string;
  target?: IosTraceTargetDescriptor;
  traceStartedAtMs?: number;
  importedAtMs?: number;
  captureId?: string;
}

export interface IosTraceMetricMappingResult {
  metrics: MetricEvent[];
  warnings: string[];
  match: IosTraceMatchResult;
}

export interface IosTraceImportResult extends IosTraceMetricMappingResult {
  parse: ParseXctraceCsvResult;
}

export type IosXctraceCaptureStatus =
  | "success"
  | "trace_recorded"
  | "no_data"
  | "failed"
  | "unsupported"
  | "aborted";

export interface IosXctraceCaptureOptions {
  sessionId: string;
  deviceId: string;
  targetId: string;
  udid: string;
  target?: IosTraceTargetDescriptor;
  durationMs?: number;
  templateName?: string;
  outputDir?: string;
  exportXPath?: string;
  keepTrace?: boolean;
  captureId?: string;
  traceStartedAtMs?: number;
  importedAtMs?: number;
  signal?: AbortSignal;
}

export interface IosXctraceCaptureResult {
  status: IosXctraceCaptureStatus;
  metrics: MetricEvent[];
  rawRowCount: number;
  matchedRowCount: number;
  metricCount: number;
  matchStatus?: IosTraceMatchResult["status"];
  matchConfidence?: IosTraceMatchResult["confidence"];
  reason: string;
  warnings: string[];
  diagnostics: Record<string, unknown>;
}
