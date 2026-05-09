import type { IosTraceCsvRow, ParseXctraceCsvResult } from "../types";

const PARSER_VERSION = "ios-xctrace-csv-v1" as const;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value.replace(/[%,$]/gu, "").replace(/\b(ms|mb|fps)\b/giu, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findColumn(headers: string[], candidates: readonly string[], reject?: RegExp): number | undefined {
  const normalizedCandidates = new Set(candidates.map((candidate) => normalizeHeader(candidate)));
  for (let index = 0; index < headers.length; index += 1) {
    const rawHeader = headers[index] ?? "";
    if (reject?.test(rawHeader) === true) {
      continue;
    }
    if (normalizedCandidates.has(normalizeHeader(rawHeader))) {
      return index;
    }
  }
  return undefined;
}

function valueAt(values: string[], index: number | undefined): string | undefined {
  if (index === undefined) {
    return undefined;
  }
  const value = values[index];
  return value === undefined || value.length === 0 ? undefined : value;
}

function parseTimestampMs(header: string | undefined, value: string | undefined): number | undefined {
  const parsed = parseNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  const normalized = normalizeHeader(header ?? "");
  if (normalized.includes("ms") || normalized.includes("millisecond")) {
    return parsed;
  }
  return parsed * 1000;
}

function assignNumber(
  row: IosTraceCsvRow,
  key: "timestampMs" | "pid" | "fps" | "frameTimeMs" | "cpuPercent" | "memoryMb",
  value: number | undefined
): void {
  if (value !== undefined) {
    row[key] = value;
  }
}

function assignString(
  row: IosTraceCsvRow,
  key: "processName" | "bundleId",
  value: string | undefined
): void {
  if (value !== undefined && value.length > 0) {
    row[key] = value;
  }
}

export function parseXctraceCsv(csvText: string): ParseXctraceCsvResult {
  const warnings: string[] = [];
  const lines = csvText
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      warnings: ["xctrace CSV is empty."],
      detectedColumns: [],
      rowCount: 0,
      parserVersion: PARSER_VERSION
    };
  }

  const headers = parseCsvLine(lines[0] ?? "");
  const detectedColumns = headers.filter((header) => header.length > 0);
  if (headers.length === 0 || detectedColumns.length === 0) {
    return {
      rows: [],
      warnings: ["xctrace CSV header is missing."],
      detectedColumns: [],
      rowCount: 0,
      parserVersion: PARSER_VERSION
    };
  }

  const columns = {
    timestamp: findColumn(headers, [
      "Time (s)",
      "Time",
      "Timestamp",
      "Timestamp (ms)",
      "Sample Time",
      "Sample Time (ms)"
    ]),
    processName: findColumn(headers, ["Process", "Process Name", "Application", "Target"]),
    bundleId: findColumn(headers, ["Bundle Identifier", "Bundle ID", "BundleId", "Bundle"]),
    pid: findColumn(headers, ["PID", "Process ID", "ProcessID"]),
    fps: findColumn(headers, ["FPS", "Frames Per Second", "Frame Rate", "Frames/s"], /avg|average/iu),
    frameTimeMs: findColumn(headers, [
      "Frame Time (ms)",
      "Frame Time",
      "Frame Duration (ms)",
      "Duration (ms)",
      "Ms Per Frame"
    ]),
    cpuPercent: findColumn(headers, ["CPU %", "CPU Percent", "CPU Usage", "CPU Usage %"]),
    memoryMb: findColumn(headers, [
      "Memory (MB)",
      "Memory MB",
      "Resident Size (MB)",
      "Physical Memory (MB)",
      "Footprint (MB)"
    ])
  };

  if (columns.fps === undefined && headers.some((header) => /avg|average/iu.test(header) && /fps/iu.test(header))) {
    warnings.push("Average FPS column was ignored; only per-row FPS columns are mapped.");
  }

  const rows: IosTraceCsvRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index] ?? "");
    if (values.length !== headers.length) {
      warnings.push(`Row ${index + 1} has ${values.length} columns; expected ${headers.length}.`);
    }

    const raw: Record<string, string> = {};
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const header = headers[columnIndex] ?? `column_${columnIndex}`;
      raw[header] = values[columnIndex] ?? "";
    }

    const row: IosTraceCsvRow = {
      rowNumber: index + 1,
      raw
    };
    assignNumber(row, "timestampMs", parseTimestampMs(headers[columns.timestamp ?? -1], valueAt(values, columns.timestamp)));
    assignString(row, "processName", valueAt(values, columns.processName));
    assignString(row, "bundleId", valueAt(values, columns.bundleId));
    assignNumber(row, "pid", parseNumber(valueAt(values, columns.pid)));
    assignNumber(row, "fps", parseNumber(valueAt(values, columns.fps)));
    assignNumber(row, "frameTimeMs", parseNumber(valueAt(values, columns.frameTimeMs)));
    assignNumber(row, "cpuPercent", parseNumber(valueAt(values, columns.cpuPercent)));
    assignNumber(row, "memoryMb", parseNumber(valueAt(values, columns.memoryMb)));
    rows.push(row);
  }

  if (rows.length === 0) {
    warnings.push("xctrace CSV has headers but no data rows.");
  }

  return {
    rows,
    warnings,
    detectedColumns,
    rowCount: rows.length,
    parserVersion: PARSER_VERSION
  };
}
