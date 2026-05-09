export interface PresentMonFrameRow {
  application?: string;
  processId?: number;
  swapChainAddress?: string;
  runtime?: string;
  syncInterval?: number;
  presentFlags?: string;
  msBetweenPresents?: number;
  msInPresentApi?: number;
  msUntilDisplayed?: number;
  cpuFrameTimeMs?: number;
  gpuDurationMs?: number;
  displayLatencyMs?: number;
  presentedFps?: number;
  displayFps?: number;
  timestampMs?: number;
  raw: Record<string, string>;
}

export interface PresentMonCsvSummary {
  averagePresentedFps?: number;
  averageDisplayFps?: number;
  averageMsBetweenPresents?: number;
  rowCount: number;
}

export interface PresentMonCsvParseResult {
  rows: PresentMonFrameRow[];
  warnings: string[];
  detectedColumns: string[];
  summary?: PresentMonCsvSummary;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function numberField(record: Record<string, string>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    const entry = Object.entries(record).find(([candidate]) => normalizeKey(candidate) === normalized);
    if (entry === undefined) {
      continue;
    }
    const parsed = Number(entry[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function stringField(record: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    const entry = Object.entries(record).find(([candidate]) => normalizeKey(candidate) === normalized);
    if (entry !== undefined && entry[1].length > 0) {
      return entry[1];
    }
  }
  return undefined;
}

function average(values: readonly number[]): number | undefined {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return undefined;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

export function parsePresentMonCsv(csv: string): PresentMonCsvParseResult {
  const warnings: string[] = [];
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], warnings: ["PresentMon CSV was empty."], detectedColumns: [] };
  }
  const headers = parseCsvLine(lines[0]!);
  if (headers.length < 2) {
    return { rows: [], warnings: ["PresentMon CSV header was malformed."], detectedColumns: headers };
  }
  const rows: PresentMonFrameRow[] = [];
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      warnings.push(`Malformed CSV row skipped: ${line}`);
      continue;
    }
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => {
      raw[header] = values[index] ?? "";
    });
    const row: PresentMonFrameRow = { raw };
    const application = stringField(raw, ["Application", "ApplicationName", "ProcessName"]);
    if (application !== undefined) {
      row.application = application;
    }
    const processId = numberField(raw, ["ProcessID", "PID"]);
    if (processId !== undefined) {
      row.processId = processId;
    }
    const swapChainAddress = stringField(raw, ["SwapChainAddress"]);
    if (swapChainAddress !== undefined) {
      row.swapChainAddress = swapChainAddress;
    }
    const runtime = stringField(raw, ["Runtime"]);
    if (runtime !== undefined) {
      row.runtime = runtime;
    }
    const syncInterval = numberField(raw, ["SyncInterval"]);
    if (syncInterval !== undefined) {
      row.syncInterval = syncInterval;
    }
    const presentFlags = stringField(raw, ["PresentFlags"]);
    if (presentFlags !== undefined) {
      row.presentFlags = presentFlags;
    }
    const msBetweenPresents = numberField(raw, ["MsBetweenPresents", "msBetweenPresents"]);
    if (msBetweenPresents !== undefined) {
      row.msBetweenPresents = msBetweenPresents;
    }
    const msInPresentApi = numberField(raw, ["MsInPresentAPI", "msInPresentApi"]);
    if (msInPresentApi !== undefined) {
      row.msInPresentApi = msInPresentApi;
    }
    const msUntilDisplayed = numberField(raw, ["MsUntilDisplayed"]);
    if (msUntilDisplayed !== undefined) {
      row.msUntilDisplayed = msUntilDisplayed;
    }
    const cpuFrameTimeMs = numberField(raw, ["CPUFrameTime", "CpuFrameTimeMs", "MsBetweenAppPresents"]);
    if (cpuFrameTimeMs !== undefined) {
      row.cpuFrameTimeMs = cpuFrameTimeMs;
    }
    const gpuDurationMs = numberField(raw, ["GPUDuration", "GpuDurationMs"]);
    if (gpuDurationMs !== undefined) {
      row.gpuDurationMs = gpuDurationMs;
    }
    const displayLatencyMs = numberField(raw, ["DisplayLatency", "DisplayLatencyMs"]);
    if (displayLatencyMs !== undefined) {
      row.displayLatencyMs = displayLatencyMs;
    }
    const presentedFps = numberField(raw, ["FPS", "FPS-Presents", "FPSPresent", "PresentedFPS", "FPS-App"]);
    if (presentedFps !== undefined) {
      row.presentedFps = presentedFps;
    }
    const displayFps = numberField(raw, ["FPS-Display", "DisplayFPS"]);
    if (displayFps !== undefined) {
      row.displayFps = displayFps;
    }
    const timestampMs = numberField(raw, ["CPUStartTime", "TimeInSeconds", "Time", "TimestampMs"]);
    if (timestampMs !== undefined) {
      row.timestampMs =
        raw.TimeInSeconds === undefined && raw.CPUStartTime === undefined ? timestampMs : timestampMs * 1000;
    }
    rows.push(row);
  }

  const summary: PresentMonCsvSummary = {
    rowCount: rows.length
  };
  const avgPresented = average(rows.map((row) => row.presentedFps).filter((value): value is number => value !== undefined));
  if (avgPresented !== undefined) {
    summary.averagePresentedFps = avgPresented;
  }
  const avgDisplay = average(rows.map((row) => row.displayFps).filter((value): value is number => value !== undefined));
  if (avgDisplay !== undefined) {
    summary.averageDisplayFps = avgDisplay;
  }
  const avgBetween = average(rows.map((row) => row.msBetweenPresents).filter((value): value is number => value !== undefined));
  if (avgBetween !== undefined) {
    summary.averageMsBetweenPresents = avgBetween;
  }
  return {
    rows,
    warnings,
    detectedColumns: headers,
    summary
  };
}
