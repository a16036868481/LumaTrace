import path from "node:path";
import type { WindowsProcessInfo } from "../types";
import type { PresentMonFrameRow } from "./PresentMonCsvParser";

export interface PresentMonMatchCandidate {
  pid?: number;
  processName?: string;
  rowCount: number;
  score: number;
  reason: string;
}

export interface PresentMonMatchResult {
  status: "matched" | "no_match" | "ambiguous";
  matchedRows: PresentMonFrameRow[];
  candidates: PresentMonMatchCandidate[];
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
}

function normalizeProcessName(value: string | undefined): string {
  if (value === undefined) {
    return "";
  }
  const normalizedPath = value.replace(/\\/gu, "/");
  return path.basename(normalizedPath).trim().toLowerCase();
}

function rowProcessName(row: PresentMonFrameRow): string {
  return normalizeProcessName(row.application);
}

function groupRows(rows: readonly PresentMonFrameRow[]): PresentMonMatchCandidate[] {
  const groups = new Map<string, PresentMonMatchCandidate>();
  for (const row of rows) {
    const key = `${row.processId ?? "unknown"}:${rowProcessName(row) || "unknown"}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.rowCount += 1;
      continue;
    }
    const candidate: PresentMonMatchCandidate = {
      rowCount: 1,
      score: 0,
      reason: "candidate"
    };
    if (row.processId !== undefined) {
      candidate.pid = row.processId;
    }
    if (row.application !== undefined) {
      candidate.processName = row.application;
    }
    groups.set(key, candidate);
  }
  return [...groups.values()];
}

export function matchPresentMonRows(
  target: Pick<WindowsProcessInfo, "pid" | "name" | "executablePath" | "startTimeMs">,
  rows: readonly PresentMonFrameRow[]
): PresentMonMatchResult {
  if (rows.length === 0) {
    return {
      status: "no_match",
      matchedRows: [],
      candidates: [],
      confidence: "none",
      reason: "PresentMon CSV contained no frame rows."
    };
  }

  const targetName = normalizeProcessName(target.name);
  const executableName = normalizeProcessName(target.executablePath);
  const candidates = groupRows(rows).map((candidate) => {
    let score = 0;
    const reasons: string[] = [];
    const candidateName = normalizeProcessName(candidate.processName);
    if (candidate.pid === target.pid) {
      score += 100;
      reasons.push("pid exact");
    }
    if (candidateName.length > 0 && (candidateName === targetName || candidateName === executableName)) {
      score += 30;
      reasons.push("process name match");
    }
    return {
      ...candidate,
      score,
      reason: reasons.join(", ") || "no target identity match"
    };
  });

  const highPidRows = rows.filter((row) => row.processId === target.pid);
  if (highPidRows.length > 0) {
    const pidNames = new Set(highPidRows.map((row) => rowProcessName(row)).filter(Boolean));
    if (pidNames.size <= 1 || pidNames.has(targetName) || pidNames.has(executableName)) {
      return {
        status: "matched",
        matchedRows: highPidRows,
        candidates,
        confidence: "high",
        reason: "PresentMon rows matched the target PID."
      };
    }
  }

  const nameRows = rows.filter((row) => {
    const candidateName = rowProcessName(row);
    return candidateName.length > 0 && (candidateName === targetName || candidateName === executableName);
  });
  if (nameRows.length === 0) {
    return {
      status: "no_match",
      matchedRows: [],
      candidates,
      confidence: "none",
      reason: "No PresentMon rows matched the target PID or process name."
    };
  }

  const pids = new Set(nameRows.map((row) => row.processId).filter((pid): pid is number => pid !== undefined));
  if (pids.size > 1) {
    return {
      status: "ambiguous",
      matchedRows: [],
      candidates,
      confidence: "none",
      reason: "Multiple PresentMon process IDs matched the same process name."
    };
  }

  return {
    status: "matched",
    matchedRows: nameRows,
    candidates,
    confidence: "medium",
    reason: "PresentMon rows matched the process name."
  };
}
