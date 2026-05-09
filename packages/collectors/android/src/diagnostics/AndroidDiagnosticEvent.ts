import type { AndroidDiagnosticCode } from "./androidDiagnosticCodes";

export type AndroidDiagnosticLevel = "debug" | "info" | "warn" | "error";

export type AndroidDiagnosticCategory =
  | "adb"
  | "device"
  | "target"
  | "lifecycle"
  | "process"
  | "cpu"
  | "memory"
  | "battery"
  | "network"
  | "fps"
  | "report";

export interface AndroidDiagnosticEvent {
  id: string;
  timestampMs: number;
  sessionId?: string;
  deviceId?: string;
  targetId?: string;
  packageName?: string;
  pid?: number;
  level: AndroidDiagnosticLevel;
  category: AndroidDiagnosticCategory;
  code: AndroidDiagnosticCode;
  message: string;
  sourceCommand?: string;
  durationMs?: number;
  sanitizedCommand?: string;
  details?: Record<string, unknown>;
  tags?: Record<string, string | number | boolean>;
}

export interface AndroidDiagnosticCreateInput
  extends Omit<AndroidDiagnosticEvent, "id" | "timestampMs"> {
  id?: string;
  timestampMs?: number;
}

export interface AndroidDiagnosticsListOptions {
  sessionId?: string;
  deviceId?: string;
  targetId?: string;
  level?: AndroidDiagnosticLevel;
  category?: AndroidDiagnosticCategory;
  code?: AndroidDiagnosticCode;
  limit?: number;
  fromTimestampMs?: number;
  toTimestampMs?: number;
}

export interface AndroidDiagnosticsSummary {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  byCode: Record<string, number>;
  warnings: number;
  errors: number;
  importantEvents: AndroidDiagnosticEvent[];
}

export interface AndroidReportDiagnosticsSection {
  androidDiagnosticsSummary: AndroidDiagnosticsSummary;
  diagnosticsTimeline: AndroidDiagnosticEvent[];
  sourcePrecisionNotices: string[];
  fallbackNotices: string[];
  lifecycleEvents: AndroidDiagnosticEvent[];
  processEvents: AndroidDiagnosticEvent[];
  fpsProbeResult?: AndroidDiagnosticEvent;
  networkPrecisionNotice?: string;
}
