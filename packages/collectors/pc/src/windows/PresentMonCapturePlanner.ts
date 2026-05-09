import path from "node:path";
import type { PcDiagnosticCreateInput } from "../diagnostics/PcDiagnosticEvent";
import { sanitizePcText } from "../diagnostics/sanitizePcDiagnostic";
import type { PresentMonToolStatus, WindowsProcessInfo } from "../types";
import {
  buildPresentMonCaptureCommand,
  type PresentMonCommand
} from "./PresentMonCaptureCommand";
import type { PresentMonCsvRetentionMode, PresentMonCsvRetentionPlan } from "./PresentMonCsvRetention";
import { buildPresentMonCsvRetentionPlan } from "./PresentMonCsvRetention";
import type { PresentMonCompatibility } from "./PresentMonVersionCompatibility";

export interface PresentMonCapturePlannerOptions {
  tool: PresentMonToolStatus;
  compatibility: PresentMonCompatibility;
  target: WindowsProcessInfo;
  sessionId: string;
  deviceId: string;
  targetId: string;
  outputFilePath: string;
  captureDurationMs?: number;
  targetMode?: "pid" | "process_name";
  keepPresentMonCsv?: boolean;
  retentionMode?: PresentMonCsvRetentionMode;
  presentMonOutputDir?: string;
}

export interface PresentMonCapturePlan {
  canCapture: boolean;
  reason?: string;
  command?: PresentMonCommand;
  targetMode: "pid" | "process_name";
  durationMs: number;
  outputFilePath: string;
  expectedCsvRetention: PresentMonCsvRetentionPlan;
  warnings: string[];
  diagnostics: PcDiagnosticCreateInput[];
}

function hasUnsafePathSegment(value: string): boolean {
  return /[\r\n<>|`]/u.test(value);
}

export function buildPresentMonCapturePlan(options: PresentMonCapturePlannerOptions): PresentMonCapturePlan {
  const diagnostics: PcDiagnosticCreateInput[] = [];
  const warnings = [...options.compatibility.warnings];
  const retentionPlan = buildPresentMonCsvRetentionPlan({
    ...(options.keepPresentMonCsv === undefined ? {} : { keepPresentMonCsv: options.keepPresentMonCsv }),
    ...(options.retentionMode === undefined ? {} : { retentionMode: options.retentionMode }),
    ...(options.presentMonOutputDir === undefined ? {} : { presentMonOutputDir: options.presentMonOutputDir })
  });
  const durationMs =
    typeof options.captureDurationMs === "number"
      ? Math.min(Math.max(Math.round(options.captureDurationMs), 1), 120000)
      : 10000;
  const baseDiagnostic = {
    sessionId: options.sessionId,
    deviceId: options.deviceId,
    targetId: options.targetId,
    pid: options.target.pid,
    category: "presentmon" as const
  };

  if (options.tool.toolStatus.status !== "available" || options.tool.presentMonPath === undefined) {
    const reason = options.tool.toolStatus.reason ?? "PresentMon is not available.";
    diagnostics.push({
      ...baseDiagnostic,
      level: "warn",
      code: options.tool.toolStatus.status === "unsupported" ? "PRESENTMON_UNSUPPORTED" : "PRESENTMON_MISSING",
      message: reason,
      details: {
        status: options.tool.toolStatus.status,
        suggestedAction: options.tool.toolStatus.suggestedAction
      }
    });
    return {
      canCapture: false,
      reason,
      targetMode: options.targetMode ?? "pid",
      durationMs,
      outputFilePath: sanitizePcText(options.outputFilePath),
      expectedCsvRetention: retentionPlan,
      warnings,
      diagnostics
    };
  }

  if (options.compatibility.unsupportedReason !== undefined) {
    diagnostics.push({
      ...baseDiagnostic,
      level: "warn",
      code: "PRESENTMON_UNSUPPORTED",
      message: options.compatibility.unsupportedReason,
      details: {
        compatibility: options.compatibility
      }
    });
    return {
      canCapture: false,
      reason: options.compatibility.unsupportedReason,
      targetMode: options.targetMode ?? "pid",
      durationMs,
      outputFilePath: sanitizePcText(options.outputFilePath),
      expectedCsvRetention: retentionPlan,
      warnings,
      diagnostics
    };
  }

  if (hasUnsafePathSegment(options.outputFilePath) || path.extname(options.outputFilePath).toLowerCase() !== ".csv") {
    const reason = "PresentMon output file path is unsafe or is not a CSV file.";
    diagnostics.push({
      ...baseDiagnostic,
      level: "error",
      code: "PRESENTMON_CAPTURE_FAILED",
      message: reason,
      details: {
        outputFilePath: sanitizePcText(options.outputFilePath)
      }
    });
    return {
      canCapture: false,
      reason,
      targetMode: options.targetMode ?? "pid",
      durationMs,
      outputFilePath: sanitizePcText(options.outputFilePath),
      expectedCsvRetention: retentionPlan,
      warnings,
      diagnostics
    };
  }

  let targetMode = options.targetMode ?? "pid";
  if (targetMode === "pid" && !options.compatibility.supportsProcessIdFilter) {
    targetMode = "process_name";
    warnings.push("PresentMon PID filtering is not advertised; falling back to process-name targeting.");
  }
  if (targetMode === "process_name" && !options.compatibility.supportsProcessNameFilter) {
    const reason = "PresentMon process-name targeting is not supported by this CLI.";
    diagnostics.push({
      ...baseDiagnostic,
      level: "warn",
      code: "PRESENTMON_UNSUPPORTED",
      message: reason
    });
    return {
      canCapture: false,
      reason,
      targetMode,
      durationMs,
      outputFilePath: sanitizePcText(options.outputFilePath),
      expectedCsvRetention: retentionPlan,
      warnings,
      diagnostics
    };
  }
  if (targetMode === "process_name") {
    warnings.push("Process-name targeting can be ambiguous when multiple processes share the same executable name.");
  }

  const command = buildPresentMonCaptureCommand({
    presentMonPath: options.tool.presentMonPath,
    outputFilePath: options.outputFilePath,
    captureDurationMs: durationMs,
    stopAfterTimedCapture: true,
    capabilities: {
      supportsLongOptions: options.compatibility.recommendedArgsStyle === "long",
      supportsPidFilter: options.compatibility.supportsProcessIdFilter,
      supportsProcessName: options.compatibility.supportsProcessNameFilter
    },
    ...(targetMode === "pid" ? { targetPid: options.target.pid } : { processName: options.target.name })
  });

  diagnostics.push({
    ...baseDiagnostic,
    level: "info",
    code: "PRESENTMON_CAPTURE_PLANNED",
    message: "PresentMon explicit capture was planned.",
    sourceCommand: "PresentMon",
    details: {
      targetMode,
      durationMs: command.durationMs,
      command: command.sanitizedPreview,
      outputFilePath: sanitizePcText(command.outputFilePath),
      retentionMode: retentionPlan.mode
    }
  });

  return {
    canCapture: true,
    command,
    targetMode,
    durationMs: command.durationMs,
    outputFilePath: sanitizePcText(command.outputFilePath),
    expectedCsvRetention: retentionPlan,
    warnings,
    diagnostics
  };
}
