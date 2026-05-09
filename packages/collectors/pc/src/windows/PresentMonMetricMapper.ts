import { METRIC_NAMES, METRIC_UNITS, type MetricEvent } from "@lumatrace/core";
import type { WindowsProcessInfo } from "../types";
import type { PresentMonFrameRow } from "./PresentMonCsvParser";
import type { PresentMonMatchResult } from "./PresentMonProcessMatcher";

export interface PresentMonMetricMapperOptions {
  sessionId: string;
  deviceId: string;
  targetId: string;
  target: WindowsProcessInfo;
  captureId: string;
  captureStartedAtMs: number;
  presentMonVersion?: string;
  match: PresentMonMatchResult;
}

export interface PresentMonMetricMapResult {
  metrics: MetricEvent[];
  warnings: string[];
}

function rowTimestampMs(row: PresentMonFrameRow, captureStartedAtMs: number, index: number): {
  timestampMs: number;
  approximate: boolean;
} {
  if (row.timestampMs !== undefined && Number.isFinite(row.timestampMs)) {
    return {
      timestampMs: captureStartedAtMs + Math.max(0, row.timestampMs),
      approximate: false
    };
  }
  return {
    timestampMs: captureStartedAtMs + index,
    approximate: true
  };
}

function finitePositive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function buildBaseTags(options: PresentMonMetricMapperOptions, row: PresentMonFrameRow, timestampApproximate: boolean) {
  return {
    platform: "windows",
    sampler: "presentmon",
    presentMonVersion: options.presentMonVersion ?? "unknown",
    processId: row.processId ?? options.target.pid,
    application: row.application ?? options.target.name,
    presentRuntime: row.runtime ?? "unknown",
    captureId: options.captureId,
    experimental: true,
    matchConfidence: options.match.confidence,
    timestampApproximate
  };
}

export function mapPresentMonRowsToMetrics(options: PresentMonMetricMapperOptions): PresentMonMetricMapResult {
  const warnings: string[] = [];
  const metrics: MetricEvent[] = [];
  let sequence = 0;

  for (const [index, row] of options.match.matchedRows.entries()) {
    const { timestampMs, approximate } = rowTimestampMs(row, options.captureStartedAtMs, index);
    const tags = buildBaseTags(options, row, approximate);
    const frameTime = finitePositive(row.msBetweenPresents ?? row.cpuFrameTimeMs);
    if ((row.msBetweenPresents ?? row.cpuFrameTimeMs) !== undefined && frameTime === undefined) {
      warnings.push("Invalid non-positive PresentMon frame time skipped.");
    }
    if (frameTime !== undefined) {
      metrics.push({
        sessionId: options.sessionId,
        timestampMs,
        monotonicMs: timestampMs,
        sequence: sequence++,
        deviceId: options.deviceId,
        targetId: options.targetId,
        metricName: METRIC_NAMES.FRAME_TIME_MS,
        value: frameTime,
        unit: METRIC_UNITS.MILLISECONDS,
        source: "PresentMon:CSV",
        precision: "estimated",
        confidence: options.match.confidence === "high" ? "high" : "medium",
        tags: {
          ...tags,
          sourceColumn: row.msBetweenPresents !== undefined ? "MsBetweenPresents" : "CPUFrameTime"
        }
      });
    }

    const explicitFps = finitePositive(row.presentedFps ?? row.displayFps);
    const derivedFps = explicitFps === undefined && frameTime !== undefined ? 1000 / frameTime : undefined;
    const fps = explicitFps ?? derivedFps;
    if (fps !== undefined && Number.isFinite(fps) && fps > 0) {
      metrics.push({
        sessionId: options.sessionId,
        timestampMs,
        monotonicMs: timestampMs,
        sequence: sequence++,
        deviceId: options.deviceId,
        targetId: options.targetId,
        metricName: METRIC_NAMES.FPS,
        value: fps,
        unit: METRIC_UNITS.FPS,
        source: "PresentMon:CSV",
        precision: "estimated",
        confidence: explicitFps !== undefined && options.match.confidence === "high" ? "high" : "medium",
        tags: {
          ...tags,
          derivedFromFrameTime: explicitFps === undefined,
          sourceColumn:
            row.presentedFps !== undefined
              ? "FPS-Presents"
              : row.displayFps !== undefined
                ? "FPS-Display"
                : "MsBetweenPresents"
        }
      });
    }
  }

  return { metrics, warnings };
}
