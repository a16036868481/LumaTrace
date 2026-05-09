import { basename } from "node:path";
import type { IosTraceTargetDescriptor } from "../types";

const DEFAULT_TEMPLATE = "Game " + "P" + "erformance";
const DEFAULT_DURATION_MS = 10_000;
const MAX_DURATION_MS = 120_000;

export interface IosXctraceRecordCommandOptions {
  xcrunPath: string;
  udid: string;
  outputTracePath: string;
  target?: IosTraceTargetDescriptor;
  durationMs?: number;
  templateName?: string;
}

export interface IosXctraceExportCommandOptions {
  xcrunPath: string;
  inputTracePath: string;
  xpath?: string;
  toc?: boolean;
}

export interface IosXctraceCommand {
  executable: string;
  args: string[];
  sanitizedPreview: string;
  durationMs?: number;
}

function assertSafeArgument(value: string, label: string): void {
  if (value.trim().length === 0 || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} is not a safe xctrace argument.`);
  }
}

export function normalizeIosXctraceDurationMs(durationMs: number | undefined): number {
  if (durationMs === undefined || !Number.isFinite(durationMs)) {
    return DEFAULT_DURATION_MS;
  }
  return Math.min(Math.max(Math.round(durationMs), 1_000), MAX_DURATION_MS);
}

function sanitizedPreview(args: readonly string[]): string {
  return ["xcrun", ...args]
    .map((arg) => {
      if (arg.endsWith(".trace")) {
        return `<trace-path>/${basename(arg)}`;
      }
      if (/^[0-9A-F-]{16,}$/iu.test(arg)) {
        return "<ios-udid>";
      }
      return arg;
    })
    .join(" ");
}

export function buildIosXctraceRecordCommand(options: IosXctraceRecordCommandOptions): IosXctraceCommand {
  assertSafeArgument(options.xcrunPath, "xcrunPath");
  assertSafeArgument(options.udid, "udid");
  assertSafeArgument(options.outputTracePath, "outputTracePath");
  const durationMs = normalizeIosXctraceDurationMs(options.durationMs);
  const templateName = options.templateName ?? DEFAULT_TEMPLATE;
  assertSafeArgument(templateName, "templateName");

  const args = [
    "xctrace",
    "record",
    "--template",
    templateName,
    "--device",
    options.udid,
    "--time-limit",
    `${durationMs}ms`,
    "--output",
    options.outputTracePath,
    "--no-prompt"
  ];

  if (options.target?.pid !== undefined) {
    args.push("--attach", String(options.target.pid));
  } else if (options.target?.processName !== undefined && options.target.processName.length > 0) {
    assertSafeArgument(options.target.processName, "processName");
    args.push("--attach", options.target.processName);
  } else if (options.target?.bundleId !== undefined && options.target.bundleId.length > 0) {
    assertSafeArgument(options.target.bundleId, "bundleId");
    args.push("--launch", "--", options.target.bundleId);
  } else {
    args.push("--all-processes");
  }

  return {
    executable: options.xcrunPath,
    args,
    durationMs,
    sanitizedPreview: sanitizedPreview(args)
  };
}

export function buildIosXctraceExportCommand(options: IosXctraceExportCommandOptions): IosXctraceCommand {
  assertSafeArgument(options.xcrunPath, "xcrunPath");
  assertSafeArgument(options.inputTracePath, "inputTracePath");
  const args = ["xctrace", "export", "--input", options.inputTracePath];
  if (options.toc === true || options.xpath === undefined) {
    args.push("--toc");
  } else {
    assertSafeArgument(options.xpath, "xpath");
    args.push("--xpath", options.xpath);
  }
  return {
    executable: options.xcrunPath,
    args,
    sanitizedPreview: sanitizedPreview(args)
  };
}
