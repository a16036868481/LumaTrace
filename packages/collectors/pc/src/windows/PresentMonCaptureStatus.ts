import type { PcDiagnosticEvent } from "../diagnostics/PcDiagnosticEvent";
import { sanitizePcText } from "../diagnostics/sanitizePcDiagnostic";

export type PresentMonCaptureStatus =
  | "idle"
  | "tool_missing"
  | "planning"
  | "starting"
  | "capturing"
  | "parsing_csv"
  | "matching_target"
  | "mapping_metrics"
  | "completed"
  | "no_data"
  | "permission_limited"
  | "failed"
  | "aborted";

export interface PresentMonCaptureStatusSnapshot {
  status: PresentMonCaptureStatus;
  sessionId?: string;
  targetId?: string;
  pid?: number;
  processName?: string;
  startedAt?: number;
  updatedAt: number;
  elapsedMs?: number;
  progressPercent?: number;
  captureDurationMs?: number;
  outputFilePathSanitized?: string;
  rawRowCount?: number;
  matchedRowCount?: number;
  metricCount?: number;
  reason?: string;
  warnings: string[];
  diagnostics: PcDiagnosticEvent[];
}

export type PresentMonCaptureStatusListener = (
  snapshot: PresentMonCaptureStatusSnapshot
) => void;

export interface PresentMonCaptureStatusUpdate {
  status: PresentMonCaptureStatus;
  sessionId?: string;
  targetId?: string;
  pid?: number;
  processName?: string;
  captureDurationMs?: number;
  outputFilePath?: string;
  rawRowCount?: number;
  matchedRowCount?: number;
  metricCount?: number;
  reason?: string;
  warnings?: readonly string[];
  diagnostics?: readonly PcDiagnosticEvent[];
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export class PresentMonCaptureStatusTracker {
  private readonly now: () => number;
  private readonly listeners = new Set<PresentMonCaptureStatusListener>();
  private snapshot: PresentMonCaptureStatusSnapshot;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.snapshot = {
      status: "idle",
      updatedAt: now(),
      warnings: [],
      diagnostics: []
    };
  }

  getStatus(): PresentMonCaptureStatusSnapshot {
    return { ...this.snapshot, warnings: [...this.snapshot.warnings], diagnostics: [...this.snapshot.diagnostics] };
  }

  subscribe(listener: PresentMonCaptureStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  update(update: PresentMonCaptureStatusUpdate): PresentMonCaptureStatusSnapshot {
    const updatedAt = this.now();
    const startedAt =
      this.snapshot.startedAt ??
      (update.status === "planning" || update.status === "starting" || update.status === "capturing"
        ? updatedAt
        : undefined);
    const elapsedMs = startedAt === undefined ? undefined : Math.max(0, updatedAt - startedAt);
    const captureDurationMs = update.captureDurationMs ?? this.snapshot.captureDurationMs;
    const progressPercent =
      update.status === "completed"
        ? 100
        : elapsedMs !== undefined && captureDurationMs !== undefined && captureDurationMs > 0
          ? clampProgress((elapsedMs / captureDurationMs) * 100)
          : this.snapshot.progressPercent;

    this.snapshot = {
      ...this.snapshot,
      ...update,
      updatedAt,
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
      ...(progressPercent === undefined ? {} : { progressPercent }),
      ...(captureDurationMs === undefined ? {} : { captureDurationMs }),
      ...(update.outputFilePath === undefined
        ? {}
        : { outputFilePathSanitized: sanitizePcText(update.outputFilePath) }),
      warnings: [...this.snapshot.warnings, ...(update.warnings ?? [])],
      diagnostics: [...this.snapshot.diagnostics, ...(update.diagnostics ?? [])]
    };
    delete (this.snapshot as { outputFilePath?: unknown }).outputFilePath;

    for (const listener of this.listeners) {
      listener(this.getStatus());
    }
    return this.getStatus();
  }
}
