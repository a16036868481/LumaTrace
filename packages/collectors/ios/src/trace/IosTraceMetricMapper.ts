import { METRIC_NAMES, type MetricEvent, type Tags } from "@lumatrace/core";
import type {
  IosTraceCsvRow,
  IosTraceMatchResult,
  IosTraceMetricMappingOptions,
  IosTraceMetricMappingResult,
  IosTraceTargetDescriptor
} from "../types";

function sameText(left: string | undefined, right: string | undefined): boolean {
  return left !== undefined && right !== undefined && left.toLowerCase() === right.toLowerCase();
}

function uniqueDefined<T>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))];
}

function buildCandidates(rows: readonly IosTraceCsvRow[]): IosTraceMatchResult["candidates"] {
  const keyCounts = new Map<string, { bundleId?: string; processName?: string; pid?: number; rowCount: number }>();
  for (const row of rows) {
    const key = `${row.bundleId ?? ""}|${row.processName ?? ""}|${row.pid ?? ""}`;
    const existing = keyCounts.get(key);
    if (existing === undefined) {
      const candidate = { rowCount: 1 };
      if (row.bundleId !== undefined) {
        Object.assign(candidate, { bundleId: row.bundleId });
      }
      if (row.processName !== undefined) {
        Object.assign(candidate, { processName: row.processName });
      }
      if (row.pid !== undefined) {
        Object.assign(candidate, { pid: row.pid });
      }
      keyCounts.set(key, candidate);
    } else {
      existing.rowCount += 1;
    }
  }
  return [...keyCounts.values()];
}

function matchRows(rows: readonly IosTraceCsvRow[], target?: IosTraceTargetDescriptor): IosTraceMatchResult {
  if (target?.bundleId !== undefined) {
    const matchedRows = rows.filter((row) => sameText(row.bundleId, target.bundleId));
    if (matchedRows.length > 0) {
      return {
        status: "matched",
        confidence: "high",
        reason: "Matched xctrace rows by bundle identifier.",
        matchedRows,
        candidates: buildCandidates(matchedRows)
      };
    }
  }

  if (target?.pid !== undefined) {
    const matchedRows = rows.filter((row) => row.pid === target.pid);
    if (matchedRows.length > 0) {
      return {
        status: "matched",
        confidence: "high",
        reason: "Matched xctrace rows by process id.",
        matchedRows,
        candidates: buildCandidates(matchedRows)
      };
    }
  }

  if (target?.processName !== undefined) {
    const matchedRows = rows.filter((row) => sameText(row.processName, target.processName));
    const candidatePids = uniqueDefined(matchedRows.map((row) => row.pid));
    const candidateBundles = uniqueDefined(matchedRows.map((row) => row.bundleId));
    if (matchedRows.length === 0) {
      return {
        status: "no_match",
        confidence: "none",
        reason: "No xctrace rows matched the target process name.",
        matchedRows: [],
        candidates: buildCandidates(rows)
      };
    }
    if (candidatePids.length > 1 || candidateBundles.length > 1) {
      return {
        status: "ambiguous",
        confidence: "none",
        reason: "Process-name matching found multiple candidate pids or bundle identifiers.",
        matchedRows: [],
        candidates: buildCandidates(matchedRows)
      };
    }
    return {
      status: "matched",
      confidence: "medium",
      reason: "Matched xctrace rows by process name.",
      matchedRows,
      candidates: buildCandidates(matchedRows)
    };
  }

  return {
    status: "no_match",
    confidence: "none",
    reason: "Target bundle id, pid, or process name is required before mapping xctrace rows.",
    matchedRows: [],
    candidates: buildCandidates(rows)
  };
}

function metricTimestamp(row: IosTraceCsvRow, sequence: number, options: IosTraceMetricMappingOptions): number {
  const base = options.traceStartedAtMs ?? options.importedAtMs ?? Date.now();
  if (row.timestampMs !== undefined) {
    return base + row.timestampMs;
  }
  return base + sequence;
}

function metricTags(
  row: IosTraceCsvRow,
  match: IosTraceMatchResult,
  options: IosTraceMetricMappingOptions,
  extra: Tags = {}
): Tags {
  return {
    platform: "ios",
    importSource: "xctrace_csv",
    manualTrace: true,
    experimental: true,
    targetMatchStatus: match.status,
    targetMatchConfidence: match.confidence,
    rowNumber: row.rowNumber,
    timestampApproximate: row.timestampMs === undefined,
    ...(options.captureId === undefined ? {} : { captureId: options.captureId }),
    ...(row.processName === undefined ? {} : { processName: row.processName }),
    ...(row.bundleId === undefined ? {} : { bundleId: row.bundleId }),
    ...(row.pid === undefined ? {} : { pid: row.pid }),
    ...extra
  };
}

function createMetric(
  row: IosTraceCsvRow,
  sequence: number,
  metricName: string,
  value: number,
  unit: string,
  match: IosTraceMatchResult,
  options: IosTraceMetricMappingOptions,
  tags: Tags = {}
): MetricEvent {
  return {
    sessionId: options.sessionId,
    timestampMs: metricTimestamp(row, sequence, options),
    sequence,
    deviceId: options.deviceId,
    targetId: options.targetId,
    metricName,
    value,
    unit,
    source: "ios:xctrace-csv-import",
    precision: "estimated",
    confidence: match.confidence === "high" ? "high" : "medium",
    parserVersion: "ios-xctrace-csv-v1",
    tags: metricTags(row, match, options, tags)
  };
}

export function mapIosTraceRowsToMetrics(
  rows: readonly IosTraceCsvRow[],
  options: IosTraceMetricMappingOptions
): IosTraceMetricMappingResult {
  const warnings: string[] = [];
  const match = matchRows(rows, options.target);
  if (match.status !== "matched") {
    return {
      metrics: [],
      warnings: [match.reason],
      match
    };
  }

  const metrics: MetricEvent[] = [];
  let sequence = 0;
  for (const row of match.matchedRows) {
    const positiveFrameTime = row.frameTimeMs !== undefined && row.frameTimeMs > 0;
    if (row.frameTimeMs !== undefined && !positiveFrameTime) {
      warnings.push(`Row ${row.rowNumber} frame_time_ms was ignored because it is not positive.`);
    }
    if (row.fps !== undefined && row.fps <= 0) {
      warnings.push(`Row ${row.rowNumber} fps was ignored because it is not positive.`);
    }
    if (row.memoryMb !== undefined && row.memoryMb <= 0) {
      warnings.push(`Row ${row.rowNumber} memory_mb was ignored because it is not positive.`);
    }
    if (row.cpuPercent !== undefined && row.cpuPercent < 0) {
      warnings.push(`Row ${row.rowNumber} cpu_percent was ignored because it is negative.`);
    }

    if (positiveFrameTime) {
      metrics.push(
        createMetric(row, sequence, METRIC_NAMES.FRAME_TIME_MS, row.frameTimeMs ?? 0, "ms", match, options, {
          valueSource: "per_row_frame_time"
        })
      );
      sequence += 1;
    }
    if (row.fps !== undefined && row.fps > 0) {
      metrics.push(
        createMetric(row, sequence, METRIC_NAMES.FPS, row.fps, "fps", match, options, {
          valueSource: "per_row_fps_column"
        })
      );
      sequence += 1;
    } else if (positiveFrameTime) {
      metrics.push(
        createMetric(row, sequence, METRIC_NAMES.FPS, 1000 / (row.frameTimeMs ?? 1), "fps", match, options, {
          valueSource: "derived_from_per_row_frame_time",
          derivedFromFrameTime: true
        })
      );
      sequence += 1;
    }
    if (row.cpuPercent !== undefined && row.cpuPercent >= 0) {
      metrics.push(
        createMetric(row, sequence, METRIC_NAMES.CPU_PERCENT, row.cpuPercent, "%", match, options, {
          valueSource: "xctrace_cpu_column"
        })
      );
      sequence += 1;
    }
    if (row.memoryMb !== undefined && row.memoryMb > 0) {
      metrics.push(
        createMetric(row, sequence, METRIC_NAMES.MEMORY_MB, row.memoryMb, "MB", match, options, {
          valueSource: "xctrace_memory_column"
        })
      );
      sequence += 1;
    }
  }

  if (metrics.length === 0) {
    warnings.push("Matched xctrace rows did not contain supported per-row metric columns.");
  }

  return {
    metrics,
    warnings,
    match
  };
}
