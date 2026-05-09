import type { PsPidResult } from "../types";

interface PsRow {
  pid: number;
  name: string;
}

function parseRows(output: string): PsRow[] {
  const rows: PsRow[] = [];
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length <= 1) {
    return rows;
  }

  const header = lines[0]?.split(/\s+/u) ?? [];
  const pidIndex = header.findIndex((column) => column.toUpperCase() === "PID");
  if (pidIndex < 0) {
    return rows;
  }

  for (const line of lines.slice(1)) {
    const parts = line.split(/\s+/u);
    const pid = Number.parseInt(parts[pidIndex] ?? "", 10);
    const name = parts.at(-1);
    if (Number.isInteger(pid) && pid > 0 && name !== undefined) {
      rows.push({ pid, name });
    }
  }

  return rows;
}

export function parsePsForPackage(output: string, packageName: string): PsPidResult {
  const rows = parseRows(output);
  const exact = rows.find((row) => row.name === packageName);
  if (exact !== undefined) {
    return {
      pid: exact.pid,
      processName: exact.name,
      matchType: "exact",
      confidence: "high"
    };
  }

  const prefix = rows.find((row) => row.name.startsWith(`${packageName}:`));
  if (prefix !== undefined) {
    return {
      pid: prefix.pid,
      processName: prefix.name,
      matchType: "prefix",
      confidence: "medium"
    };
  }

  return {
    pid: null,
    matchType: "none",
    confidence: "low"
  };
}
