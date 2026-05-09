import { CommandRunner, type CommandRunnerOptions } from "@lumatrace/core";
import { processToTarget, type WindowsProcessAdapter, type WindowsProcessInfo, type WindowsProcessListResult } from "../types";
import { sanitizePcText } from "../diagnostics/sanitizePcDiagnostic";
import { applyWindowsCommandPolicy, WINDOWS_COMMAND_POLICIES } from "./WindowsCommandPolicy";

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/,/g, "").trim();
  if (normalized.length === 0) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMemoryBytes(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/,/g, "").trim();
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt]?b?|k)?$/i.exec(normalized);
  if (match === null) {
    return parseNumber(normalized);
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "k" || unit === "kb") {
    return amount * 1024;
  }
  if (unit === "m" || unit === "mb") {
    return amount * 1024 * 1024;
  }
  if (unit === "g" || unit === "gb") {
    return amount * 1024 * 1024 * 1024;
  }
  if (unit === "t" || unit === "tb") {
    return amount * 1024 * 1024 * 1024 * 1024;
  }
  return amount;
}

function parseWindowsDate(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const trimmed = value.trim();
  const jsonDateMatch = /^\/Date\((\d+)\)\/$/.exec(trimmed);
  if (jsonDateMatch !== null) {
    const parsed = Number(jsonDateMatch[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const cimMatch = /^(\d{14})/.exec(trimmed);
  if (cimMatch !== null) {
    const raw = cimMatch[1]!;
    const date = new Date(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)) - 1,
      Number(raw.slice(6, 8)),
      Number(raw.slice(8, 10)),
      Number(raw.slice(10, 12)),
      Number(raw.slice(12, 14))
    );
    return date.getTime();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseWindowsProcessTimeMs(value: unknown, msValue: unknown): number | undefined {
  const explicitMs = parseNumber(msValue);
  if (explicitMs !== undefined) {
    return explicitMs;
  }
  const hundredNanoseconds = parseNumber(value);
  return hundredNanoseconds === undefined ? undefined : hundredNanoseconds / 10000;
}

function normalizeProcess(row: Record<string, unknown>, warnings: string[]): WindowsProcessInfo | null {
  const pid = parseNumber(row.ProcessId ?? row.PID ?? row.pid);
  const nameValue = row.Name ?? row.ImageName ?? row["Image Name"] ?? row.name;
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  if (pid === undefined || pid <= 0 || name.length === 0) {
    warnings.push(`Malformed process row skipped: ${JSON.stringify(row).slice(0, 200)}`);
    return null;
  }
  const process: WindowsProcessInfo = {
    pid,
    name,
    raw: row
  };
  const executablePath = row.ExecutablePath ?? row.Path ?? row.executablePath;
  if (typeof executablePath === "string" && executablePath.length > 0) {
    process.executablePath = executablePath;
  }
  const iconDataUrl = row.IconDataUrl ?? row.iconDataUrl;
  if (typeof iconDataUrl === "string" && iconDataUrl.startsWith("data:image/")) {
    process.iconDataUrl = iconDataUrl;
  }
  const commandLine = row.CommandLine ?? row.commandLine;
  if (typeof commandLine === "string" && commandLine.length > 0) {
    process.commandLine = sanitizePcText(commandLine);
  }
  const parentPid = parseNumber(row.ParentProcessId ?? row.ParentPID);
  if (parentPid !== undefined) {
    process.parentPid = parentPid;
  }
  const workingSetBytes = parseMemoryBytes(row.WorkingSetSize ?? row.WorkingSetBytes ?? row["Mem Usage"]);
  if (workingSetBytes !== undefined) {
    process.workingSetBytes = workingSetBytes;
  }
  const privateBytes = parseNumber(row.PrivatePageCount ?? row.PrivateBytes);
  if (privateBytes !== undefined) {
    process.privateBytes = privateBytes;
  }
  const kernelTimeMs = parseWindowsProcessTimeMs(row.KernelModeTime, row.KernelModeTimeMs ?? row.KernelTimeMs);
  if (kernelTimeMs !== undefined) {
    process.kernelTimeMs = kernelTimeMs;
  }
  const userTimeMs = parseWindowsProcessTimeMs(row.UserModeTime, row.UserModeTimeMs ?? row.UserTimeMs);
  if (userTimeMs !== undefined) {
    process.userTimeMs = userTimeMs;
  }
  const startTimeMs = parseWindowsDate(row.CreationDate ?? row.StartTime ?? row.startTimeMs);
  if (startTimeMs !== undefined) {
    process.startTimeMs = startTimeMs;
  } else if (typeof row.startTimeMs === "number") {
    process.startTimeMs = row.startTimeMs;
  }
  return process;
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

export function parseTasklistCsv(output: string): WindowsProcessListResult {
  const warnings: string[] = [];
  const rows = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length === 0) {
    return { processes: [], warnings: ["tasklist output was empty."] };
  }
  const first = parseCsvLine(rows[0]!);
  const hasHeader = first.some((field) => /image name|pid/i.test(field));
  const headers = hasHeader ? first : ["Image Name", "PID", "Session Name", "Session#", "Mem Usage"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const processes: WindowsProcessInfo[] = [];
  for (const row of dataRows) {
    const values = parseCsvLine(row);
    if (values.length < 2) {
      warnings.push(`Malformed CSV row skipped: ${row}`);
      continue;
    }
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    const process = normalizeProcess(record, warnings);
    if (process !== null) {
      processes.push(process);
    }
  }
  return { processes, warnings };
}

export function parsePowerShellProcessJson(output: string): WindowsProcessListResult {
  const warnings: string[] = [];
  if (output.trim().length === 0) {
    return { processes: [], warnings: ["PowerShell process JSON was empty."] };
  }
  try {
    const parsed = JSON.parse(output) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const processes = rows
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => normalizeProcess(row, warnings))
      .filter((process): process is WindowsProcessInfo => process !== null);
    return { processes, warnings };
  } catch (error) {
    return {
      processes: [],
      warnings: [`Failed to parse PowerShell process JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

export class WindowsProcessList implements WindowsProcessAdapter {
  private readonly runner: CommandRunner;
  private readonly platform: NodeJS.Platform;

  constructor(options: { commandRunner?: CommandRunner; platform?: NodeJS.Platform } = {}) {
    this.runner = options.commandRunner ?? new CommandRunner();
    this.platform = options.platform ?? process.platform;
  }

  async listProcesses(): Promise<WindowsProcessInfo[]> {
    if (this.platform !== "win32") {
      return [];
    }
    const powershellCommand = "powershell.exe";
    const powershellScript = `
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);
$OutputEncoding=[System.Text.UTF8Encoding]::new($false);
$iconEnabled=$true;
try { Add-Type -AssemblyName System.Drawing -ErrorAction Stop } catch { $iconEnabled=$false }
$iconCache=@{};
Get-CimInstance Win32_Process | ForEach-Object {
  $path=$_.ExecutablePath;
  $iconDataUrl=$null;
  if ($iconEnabled -and $path -and [System.IO.File]::Exists($path)) {
    if (-not $iconCache.ContainsKey($path)) {
      try {
        $icon=[System.Drawing.Icon]::ExtractAssociatedIcon($path);
        if ($null -ne $icon) {
          $bitmap=$icon.ToBitmap();
          $resized=New-Object System.Drawing.Bitmap 24, 24;
          $graphics=[System.Drawing.Graphics]::FromImage($resized);
          $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;
          $graphics.DrawImage($bitmap, 0, 0, 24, 24);
          $stream=New-Object System.IO.MemoryStream;
          $resized.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png);
          $iconCache[$path]="data:image/png;base64," + [Convert]::ToBase64String($stream.ToArray());
          $stream.Dispose();
          $graphics.Dispose();
          $resized.Dispose();
          $bitmap.Dispose();
          $icon.Dispose();
        } else {
          $iconCache[$path]=$null;
        }
      } catch {
        $iconCache[$path]=$null;
      }
    }
    $iconDataUrl=$iconCache[$path];
  }
  [PSCustomObject]@{
    ProcessId=$_.ProcessId;
    Name=$_.Name;
    ExecutablePath=$_.ExecutablePath;
    ParentProcessId=$_.ParentProcessId;
    CreationDate=$_.CreationDate;
    WorkingSetSize=$_.WorkingSetSize;
    PrivatePageCount=$_.PrivatePageCount;
    KernelModeTime=$_.KernelModeTime;
    UserModeTime=$_.UserModeTime;
    IconDataUrl=$iconDataUrl;
  }
} | ConvertTo-Json -Compress
`.trim();
    const powershellArgs = [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      powershellScript
    ];
    const powershellResult = await this.runner.run(
      applyWindowsCommandPolicy(
        {
          command: powershellCommand,
          args: powershellArgs,
          timeoutMs: WINDOWS_COMMAND_POLICIES.process_list.timeoutMs
        } satisfies CommandRunnerOptions,
        WINDOWS_COMMAND_POLICIES.process_list
      )
    );
    if (powershellResult.exitCode === 0 && !powershellResult.timedOut && !powershellResult.stdoutTruncated) {
      const parsed = parsePowerShellProcessJson(powershellResult.stdout);
      if (parsed.processes.length > 0) {
        return parsed.processes;
      }
    }

    const tasklistResult = await this.runner.run(
      applyWindowsCommandPolicy(
        {
          command: "tasklist.exe",
          args: ["/fo", "csv", "/nh"],
          timeoutMs: WINDOWS_COMMAND_POLICIES.process_list.timeoutMs
        } satisfies CommandRunnerOptions,
        WINDOWS_COMMAND_POLICIES.process_list
      )
    );
    if (tasklistResult.exitCode !== 0 || tasklistResult.timedOut) {
      return [];
    }
    return parseTasklistCsv(tasklistResult.stdout).processes;
  }

  async getProcess(pid: number): Promise<WindowsProcessInfo | null> {
    const processes = await this.listProcesses();
    return processes.find((processInfo) => processInfo.pid === pid) ?? null;
  }

  mapProcessToTarget(process: WindowsProcessInfo) {
    return processToTarget(process);
  }
}
