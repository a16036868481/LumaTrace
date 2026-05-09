import path from "node:path";
import { sanitizePcText } from "../diagnostics/sanitizePcDiagnostic";

const MAX_CAPTURE_DURATION_MS = 120000;
const DEFAULT_CAPTURE_DURATION_MS = 10000;
const BLOCKED_ADDITIONAL_ARGS = new Set([
  "--output_file",
  "-output_file",
  "--output",
  "-output",
  "--process_id",
  "-process_id",
  "--process_name",
  "-process_name",
  "--timed",
  "-timed",
  "--terminate_after_timed",
  "-terminate_after_timed",
  "--stop_existing_session",
  "-stop_existing_session"
]);

export interface PresentMonCliCapabilities {
  supportsLongOptions?: boolean;
  supportsPidFilter?: boolean;
  supportsProcessName?: boolean;
}

export interface PresentMonCaptureOptions {
  presentMonPath: string;
  targetPid?: number;
  processName?: string;
  outputFilePath: string;
  captureDurationMs?: number;
  stopAfterTimedCapture?: boolean;
  includeAllProcesses?: boolean;
  additionalArgs?: string[];
  capabilities?: PresentMonCliCapabilities;
}

export interface PresentMonCommand {
  executable: string;
  args: string[];
  outputFilePath: string;
  durationMs: number;
  sanitizedPreview: string;
}

function assertSafeArg(value: string, label: string): void {
  if (value.length === 0 || /[\r\n&|<>`]/u.test(value)) {
    throw new Error(`Unsafe PresentMon ${label}.`);
  }
}

function normalizeDuration(value: number | undefined): number {
  const duration = value ?? DEFAULT_CAPTURE_DURATION_MS;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("PresentMon captureDurationMs must be a positive number.");
  }
  return Math.min(Math.round(duration), MAX_CAPTURE_DURATION_MS);
}

function validateOutputFilePath(outputFilePath: string): string {
  assertSafeArg(outputFilePath, "output path");
  const normalized = path.normalize(outputFilePath);
  if (!/\.csv$/iu.test(normalized)) {
    throw new Error("PresentMon outputFilePath must end with .csv.");
  }
  return normalized;
}

function validateAdditionalArgs(args: readonly string[] = []): string[] {
  const safe: string[] = [];
  for (const arg of args) {
    assertSafeArg(arg, "argument");
    const normalized = arg.toLowerCase();
    if (BLOCKED_ADDITIONAL_ARGS.has(normalized)) {
      throw new Error(`PresentMon additionalArgs cannot override ${arg}.`);
    }
    safe.push(arg);
  }
  return safe;
}

export function parsePresentMonHelpCapabilities(helpOutput: string): PresentMonCliCapabilities {
  return {
    supportsLongOptions: /--output[_-]?file|--timed|--process[_-]?id/iu.test(helpOutput),
    supportsPidFilter: /(?:--|-)?process[_-]?id|(?:--|-)?pid/iu.test(helpOutput),
    supportsProcessName: /(?:--|-)?process[_-]?name/iu.test(helpOutput)
  };
}

export function buildPresentMonCaptureCommand(options: PresentMonCaptureOptions): PresentMonCommand {
  assertSafeArg(options.presentMonPath, "executable path");
  const outputFilePath = validateOutputFilePath(options.outputFilePath);
  const durationMs = normalizeDuration(options.captureDurationMs);
  const capabilities = options.capabilities ?? {};
  const useLongOptions = capabilities.supportsLongOptions !== false;
  const supportsPidFilter = capabilities.supportsPidFilter !== false;
  const supportsProcessName = capabilities.supportsProcessName !== false;
  const includeAllProcesses = options.includeAllProcesses === true;
  const args: string[] = [];

  if (options.stopAfterTimedCapture !== false) {
    args.push(useLongOptions ? "--stop_existing_session" : "-stop_existing_session");
    args.push(useLongOptions ? "--terminate_after_timed" : "-terminate_after_timed");
  }

  args.push(useLongOptions ? "--output_file" : "-output_file", outputFilePath);
  args.push(useLongOptions ? "--timed" : "-timed", String(Math.ceil(durationMs / 1000)));

  if (!includeAllProcesses) {
    if (options.targetPid !== undefined && supportsPidFilter) {
      if (!Number.isInteger(options.targetPid) || options.targetPid <= 0) {
        throw new Error("PresentMon targetPid must be a positive integer.");
      }
      args.push(useLongOptions ? "--process_id" : "-process_id", String(options.targetPid));
    } else if (options.processName !== undefined && options.processName.length > 0 && supportsProcessName) {
      assertSafeArg(options.processName, "process name");
      args.push(useLongOptions ? "--process_name" : "-process_name", options.processName);
    } else {
      throw new Error("PresentMon capture requires targetPid, processName, or includeAllProcesses.");
    }
  }

  args.push(...validateAdditionalArgs(options.additionalArgs));

  return {
    executable: options.presentMonPath,
    args,
    outputFilePath,
    durationMs,
    sanitizedPreview: sanitizePcText([options.presentMonPath, ...args].join(" "))
  };
}
