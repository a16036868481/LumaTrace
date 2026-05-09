import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CommandRunner, type CommandRunnerOptions, type MetricEvent } from "@lumatrace/core";
import type { PcDiagnosticEvent } from "../diagnostics/PcDiagnosticEvent";
import { PcDiagnosticsTimeline } from "../diagnostics/PcDiagnosticsTimeline";
import { sanitizePcText } from "../diagnostics/sanitizePcDiagnostic";
import type { WindowsProcessInfo } from "../types";
import { applyWindowsCommandPolicy, WINDOWS_COMMAND_POLICIES } from "./WindowsCommandPolicy";
import { analyzePresentMonPermissionOutput } from "./PresentMonPermissionDiagnostics";
import { mapPresentMonRowsToMetrics } from "./PresentMonMetricMapper";
import { matchPresentMonRows } from "./PresentMonProcessMatcher";
import { parsePresentMonCsv } from "./PresentMonCsvParser";
import type { PresentMonToolStatus } from "../types";
import type { PresentMonCompatibility } from "./PresentMonVersionCompatibility";
import { detectPresentMonCompatibility } from "./PresentMonVersionCompatibility";
import { buildPresentMonCapturePlan } from "./PresentMonCapturePlanner";
import type { PresentMonCsvRetentionMode, PresentMonCsvRetentionPlan } from "./PresentMonCsvRetention";
import {
  applyPresentMonCsvRetention,
  validatePresentMonCsvSize
} from "./PresentMonCsvRetention";
import {
  PresentMonCaptureStatusTracker,
  type PresentMonCaptureStatusListener,
  type PresentMonCaptureStatusSnapshot
} from "./PresentMonCaptureStatus";

export type PresentMonCaptureResultStatus =
  | "success"
  | "no_data"
  | "failed"
  | "aborted"
  | "permission_limited";

export interface PresentMonCaptureRuntimeOptions {
  commandRunner?: CommandRunner;
  presentMonTool: PresentMonToolLike;
  diagnosticsTimeline?: PcDiagnosticsTimeline;
  tempDir?: string;
  now?: () => number;
  readFileText?: (path: string) => Promise<string>;
  processLookup?: (pid: number) => Promise<WindowsProcessInfo | null>;
}

export interface PresentMonToolLike {
  findPresentMon(): Promise<PresentMonToolStatus>;
  getPresentMonCompatibility?(presentMonPath: string): Promise<PresentMonCompatibility>;
}

export interface PresentMonSessionCaptureOptions {
  sessionId: string;
  deviceId: string;
  targetId: string;
  target: WindowsProcessInfo;
  captureDurationMs?: number;
  targetMode?: "pid" | "process_name";
  outputDir?: string;
  keepCsv?: boolean;
  retentionMode?: PresentMonCsvRetentionMode;
  gracePeriodMs?: number;
  presentMonVersion?: string;
}

export interface PresentMonCaptureResult {
  status: PresentMonCaptureResultStatus;
  outputFilePath?: string;
  rawRowCount: number;
  matchedRowCount: number;
  metrics: MetricEvent[];
  diagnostics: PcDiagnosticEvent[];
  warnings: string[];
  durationMs: number;
  source: "PresentMon";
}

function diagnosticBase(options: PresentMonSessionCaptureOptions) {
  return {
    sessionId: options.sessionId,
    deviceId: options.deviceId,
    targetId: options.targetId,
    pid: options.target.pid
  };
}

function defaultCompatibility(tool: PresentMonToolStatus): PresentMonCompatibility {
  return detectPresentMonCompatibility(tool.toolStatus.version ?? "PresentMon version 0.0.0", [
    "--output_file",
    "--timed",
    "--process_id",
    "--process_name",
    "--stop_existing_session"
  ].join("\n"));
}

export class PresentMonCaptureRuntime {
  private readonly runner: CommandRunner;
  private readonly presentMonTool: PresentMonToolLike;
  private readonly diagnostics: PcDiagnosticsTimeline;
  private readonly tempDir: string;
  private readonly now: () => number;
  private readonly readFileText: (path: string) => Promise<string>;
  private readonly processLookup: ((pid: number) => Promise<WindowsProcessInfo | null>) | undefined;
  private readonly statusTracker: PresentMonCaptureStatusTracker;
  private abortController: AbortController | undefined;

  constructor(options: PresentMonCaptureRuntimeOptions) {
    this.runner = options.commandRunner ?? new CommandRunner();
    this.presentMonTool = options.presentMonTool;
    this.diagnostics = options.diagnosticsTimeline ?? new PcDiagnosticsTimeline();
    this.tempDir = options.tempDir ?? path.join(os.tmpdir(), "lumatrace-presentmon");
    this.now = options.now ?? Date.now;
    this.readFileText = options.readFileText ?? ((filePath) => readFile(filePath, "utf8"));
    this.processLookup = options.processLookup;
    this.statusTracker = new PresentMonCaptureStatusTracker(this.now);
  }

  getStatus(): PresentMonCaptureStatusSnapshot {
    return this.statusTracker.getStatus();
  }

  subscribeStatus(listener: PresentMonCaptureStatusListener): () => void {
    return this.statusTracker.subscribe(listener);
  }

  async abort(): Promise<void> {
    this.abortController?.abort();
    this.statusTracker.update({
      status: "aborted",
      reason: "PresentMon capture abort requested."
    });
  }

  async capture(options: PresentMonSessionCaptureOptions): Promise<PresentMonCaptureResult> {
    const startedAt = this.now();
    const diagnostics: PcDiagnosticEvent[] = [];
    const warnings: string[] = [];
    const addDiagnostic = (input: Parameters<PcDiagnosticsTimeline["add"]>[0]): PcDiagnosticEvent => {
      const event = this.diagnostics.add(input);
      diagnostics.push(event);
      this.statusTracker.update({ status: this.statusTracker.getStatus().status, diagnostics: [event] });
      return event;
    };

    this.statusTracker.update({
      status: "planning",
      sessionId: options.sessionId,
      targetId: options.targetId,
      pid: options.target.pid,
      processName: options.target.name,
      captureDurationMs: options.captureDurationMs ?? 10000
    });

    const tool = await this.presentMonTool.findPresentMon();
    if (tool.toolStatus.status !== "available" || tool.presentMonPath === undefined) {
      const event = addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: tool.toolStatus.status === "unsupported" ? "PRESENTMON_UNSUPPORTED" : "PRESENTMON_MISSING",
        message: tool.toolStatus.reason ?? "PresentMon is not available.",
        details: {
          status: tool.toolStatus.status,
          suggestedAction: tool.toolStatus.suggestedAction
        }
      });
      this.statusTracker.update({
        status: tool.toolStatus.status === "missing" ? "tool_missing" : "failed",
        reason: event.message
      });
      return this.result("failed", startedAt, diagnostics, warnings, [], 0, 0);
    }

    const compatibility =
      this.presentMonTool.getPresentMonCompatibility === undefined
        ? defaultCompatibility(tool)
        : await this.presentMonTool.getPresentMonCompatibility(tool.presentMonPath).catch(() => defaultCompatibility(tool));
    addDiagnostic({
      ...diagnosticBase(options),
      level: "info",
      category: "presentmon",
      code: "PRESENTMON_VERSION_DETECTED",
      message: "PresentMon version and CLI compatibility were detected.",
      details: {
        version: compatibility.version ?? tool.toolStatus.version ?? "unknown",
        compatibility
      }
    });

    const outputDir = options.outputDir ?? this.tempDir;
    await mkdir(outputDir, { recursive: true });
    const outputFilePath = path.join(outputDir, `lumatrace-presentmon-${randomUUID()}.csv`);
    const plan = buildPresentMonCapturePlan({
      tool,
      compatibility,
      target: options.target,
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      targetId: options.targetId,
      outputFilePath,
      ...(options.captureDurationMs === undefined ? {} : { captureDurationMs: options.captureDurationMs }),
      ...(options.targetMode === undefined ? {} : { targetMode: options.targetMode }),
      ...(options.keepCsv === undefined ? {} : { keepPresentMonCsv: options.keepCsv }),
      ...(options.retentionMode === undefined ? {} : { retentionMode: options.retentionMode }),
      presentMonOutputDir: outputDir
    });
    warnings.push(...plan.warnings);
    for (const diagnostic of plan.diagnostics) {
      addDiagnostic(diagnostic);
    }
    this.statusTracker.update({
      status: plan.canCapture ? "starting" : "failed",
      captureDurationMs: plan.durationMs,
      outputFilePath: plan.outputFilePath,
      warnings: plan.warnings,
      ...(plan.reason === undefined ? {} : { reason: plan.reason })
    });
    if (!plan.canCapture || plan.command === undefined) {
      return this.result("failed", startedAt, diagnostics, warnings, [], 0, 0, plan.outputFilePath);
    }

    const command = plan.command;
    addDiagnostic({
      ...diagnosticBase(options),
      level: "info",
      category: "presentmon",
      code: "PRESENTMON_CAPTURE_STARTED",
      message: "PresentMon explicit timed capture started.",
      sourceCommand: "PresentMon",
      details: {
        command: command.sanitizedPreview,
        durationMs: command.durationMs,
        outputFilePath: sanitizePcText(command.outputFilePath)
      }
    });

    this.abortController = new AbortController();
    this.statusTracker.update({
      status: "capturing",
      captureDurationMs: command.durationMs,
      outputFilePath: command.outputFilePath
    });
    const runOptions: CommandRunnerOptions = applyWindowsCommandPolicy(
      {
        command: command.executable,
        args: command.args,
        timeoutMs: command.durationMs + (options.gracePeriodMs ?? 5000),
        signal: this.abortController.signal
      },
      WINDOWS_COMMAND_POLICIES.presentmon_capture
    );
    const commandResult = await this.runner.run(runOptions);
    this.abortController = undefined;

    const permission = analyzePresentMonPermissionOutput(
      `${commandResult.sanitizedStdout}\n${commandResult.sanitizedStderr}`
    );
    if (permission.permissionLimited) {
      warnings.push(...permission.warnings);
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_PERMISSION_LIMITED",
        message: "PresentMon reported permission-limited capture.",
        sourceCommand: "PresentMon",
        durationMs: commandResult.durationMs,
        details: {
          warnings: permission.warnings,
          stdout: commandResult.sanitizedStdout.slice(0, 4096),
          stderr: commandResult.sanitizedStderr.slice(0, 4096)
        }
      });
      if (permission.logAccessUsersHint) {
        addDiagnostic({
          ...diagnosticBase(options),
          level: "warn",
          category: "presentmon",
          code: "PRESENTMON_LOG_ACCESS_USERS_HINT",
          message: "Adding the user to Windows Windows log access group may help PresentMon access."
        });
      }
      if (permission.adminHint) {
        addDiagnostic({
          ...diagnosticBase(options),
          level: "warn",
          category: "presentmon",
          code: "PRESENTMON_ADMIN_HINT",
          message: "PresentMon reported an administrator/elevation hint. LumaTrace does not bypass Windows permissions."
        });
      }
    }

    if (commandResult.aborted) {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_CAPTURE_ABORTED",
        message: "PresentMon capture was aborted.",
        durationMs: commandResult.durationMs
      });
      this.statusTracker.update({
        status: "aborted",
        reason: "PresentMon capture was aborted."
      });
      return this.result("aborted", startedAt, diagnostics, warnings, [], 0, 0, command.outputFilePath);
    }

    if (commandResult.exitCode !== 0 || commandResult.timedOut) {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "error",
        category: "presentmon",
        code: "PRESENTMON_CAPTURE_FAILED",
        message: commandResult.timedOut ? "PresentMon capture timed out." : "PresentMon capture failed.",
        sourceCommand: "PresentMon",
        durationMs: commandResult.durationMs,
        details: {
          exitCode: commandResult.exitCode,
          timedOut: commandResult.timedOut,
          stdout: commandResult.sanitizedStdout.slice(0, 4096),
          stderr: commandResult.sanitizedStderr.slice(0, 4096)
        }
      });
      this.statusTracker.update({
        status: permission.permissionLimited ? "permission_limited" : "failed",
        reason: commandResult.timedOut ? "PresentMon capture timed out." : "PresentMon capture failed."
      });
      return this.result(permission.permissionLimited ? "permission_limited" : "failed", startedAt, diagnostics, warnings, [], 0, 0, command.outputFilePath);
    }

    const retentionPlan = plan.expectedCsvRetention;
    this.statusTracker.update({ status: "parsing_csv" });
    let sizeCheck:
      | Awaited<ReturnType<typeof validatePresentMonCsvSize>>
      | undefined;
    try {
      sizeCheck = await validatePresentMonCsvSize(command.outputFilePath, retentionPlan);
    } catch {
      // The injected test reader may not create a real file. The read step below remains the
      // authoritative missing-file check; real missing files will still become no_data.
    }
    if (sizeCheck !== undefined && !sizeCheck.ok) {
      warnings.push(sizeCheck.warning ?? "PresentMon CSV was rejected.");
      addDiagnostic({
        ...diagnosticBase(options),
        level: "error",
        category: "presentmon",
        code: "PRESENTMON_CAPTURE_FAILED",
        message: sizeCheck.warning ?? "PresentMon CSV was rejected.",
        details: {
          outputFilePath: sizeCheck.pathSanitized,
          sizeBytes: sizeCheck.sizeBytes
        }
      });
      this.statusTracker.update({
        status: "failed",
        ...(sizeCheck.warning === undefined ? {} : { reason: sizeCheck.warning })
      });
      return this.result("failed", startedAt, diagnostics, warnings, [], 0, 0, command.outputFilePath);
    }

    let csv: string;
    try {
      csv = await this.readFileText(command.outputFilePath);
    } catch {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_CSV_MISSING",
        message: "PresentMon capture finished but CSV output was not readable.",
        details: {
          outputFilePath: sanitizePcText(command.outputFilePath)
        }
      });
      this.statusTracker.update({
        status: permission.permissionLimited ? "permission_limited" : "no_data",
        reason: "PresentMon CSV output was not readable."
      });
      return this.result(permission.permissionLimited ? "permission_limited" : "no_data", startedAt, diagnostics, warnings, [], 0, 0, command.outputFilePath);
    }

    const parsed = parsePresentMonCsv(csv);
    if (parsed.warnings.length > 0) {
      warnings.push(...parsed.warnings);
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_CSV_PARSE_WARNING",
        message: "PresentMon CSV contained malformed rows.",
        details: {
          warnings: parsed.warnings.slice(0, 20)
        }
      });
    }

    if (parsed.rows.length === 0) {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_CSV_EMPTY",
        message: "PresentMon CSV contained no usable frame rows."
      });
      await this.cleanup(command.outputFilePath, retentionPlan, options, addDiagnostic);
      this.statusTracker.update({
        status: permission.permissionLimited ? "permission_limited" : "no_data",
        rawRowCount: 0,
        matchedRowCount: 0,
        metricCount: 0,
        reason: "PresentMon CSV contained no usable frame rows."
      });
      return this.result(permission.permissionLimited ? "permission_limited" : "no_data", startedAt, diagnostics, warnings, [], parsed.rows.length, 0, command.outputFilePath);
    }

    const processInvalid = await this.checkProcessIdentity(options, addDiagnostic);
    if (processInvalid !== undefined) {
      warnings.push(processInvalid);
      await this.cleanup(command.outputFilePath, retentionPlan, options, addDiagnostic);
      this.statusTracker.update({
        status: "no_data",
        rawRowCount: parsed.rows.length,
        matchedRowCount: 0,
        metricCount: 0,
        reason: processInvalid
      });
      return this.result("no_data", startedAt, diagnostics, warnings, [], parsed.rows.length, 0, command.outputFilePath);
    }

    this.statusTracker.update({ status: "matching_target", rawRowCount: parsed.rows.length });
    const match = matchPresentMonRows(options.target, parsed.rows);
    if (match.status === "no_match" || match.status === "ambiguous") {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: match.status === "ambiguous" ? "PRESENTMON_TARGET_AMBIGUOUS" : "PRESENTMON_TARGET_NO_MATCH",
        message: match.reason,
        details: {
          candidates: match.candidates
        }
      });
      await this.cleanup(command.outputFilePath, retentionPlan, options, addDiagnostic);
      this.statusTracker.update({
        status: "no_data",
        rawRowCount: parsed.rows.length,
        matchedRowCount: 0,
        metricCount: 0,
        reason: match.reason
      });
      return this.result("no_data", startedAt, diagnostics, warnings, [], parsed.rows.length, 0, command.outputFilePath);
    }

    this.statusTracker.update({ status: "mapping_metrics", matchedRowCount: match.matchedRows.length });
    const mapped = mapPresentMonRowsToMetrics({
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      targetId: options.targetId,
      target: options.target,
      captureId: path.basename(command.outputFilePath, ".csv"),
      captureStartedAtMs: startedAt,
      ...(tool.toolStatus.version === undefined && options.presentMonVersion === undefined
        ? {}
        : { presentMonVersion: tool.toolStatus.version ?? options.presentMonVersion }),
      match
    });
    warnings.push(...mapped.warnings);

    if (mapped.metrics.length > 0) {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "info",
        category: "presentmon",
        code: "PRESENTMON_METRIC_MAPPED",
        message: "PresentMon CSV rows were mapped to FPS/frame-time metrics.",
        details: {
          rawRowCount: parsed.rows.length,
          matchedRowCount: match.matchedRows.length,
          metricCount: mapped.metrics.length,
          confidence: match.confidence
        }
      });
    }

    addDiagnostic({
      ...diagnosticBase(options),
      level: "info",
      category: "presentmon",
      code: "PRESENTMON_CAPTURE_COMPLETED",
      message: "PresentMon capture completed.",
      durationMs: this.now() - startedAt,
      details: {
        rawRowCount: parsed.rows.length,
        matchedRowCount: match.matchedRows.length,
        outputFilePath: sanitizePcText(command.outputFilePath)
      }
    });

    await this.cleanup(command.outputFilePath, retentionPlan, options, addDiagnostic);
    this.statusTracker.update({
      status: permission.permissionLimited ? "permission_limited" : "completed",
      rawRowCount: parsed.rows.length,
      matchedRowCount: match.matchedRows.length,
      metricCount: mapped.metrics.length,
      ...(permission.permissionLimited ? { reason: "PresentMon reported permission limitations." } : {})
    });
    return this.result(permission.permissionLimited ? "permission_limited" : "success", startedAt, diagnostics, warnings, mapped.metrics, parsed.rows.length, match.matchedRows.length, command.outputFilePath);
  }

  private async checkProcessIdentity(
    options: PresentMonSessionCaptureOptions,
    addDiagnostic: (input: Parameters<PcDiagnosticsTimeline["add"]>[0]) => PcDiagnosticEvent
  ): Promise<string | undefined> {
    if (this.processLookup === undefined) {
      return undefined;
    }
    const current = await this.processLookup(options.target.pid);
    if (current === null) {
      const reason = "Target process exited during PresentMon capture.";
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_PROCESS_EXITED_DURING_CAPTURE",
        message: reason
      });
      return reason;
    }
    if (
      options.target.startTimeMs !== undefined &&
      current.startTimeMs !== undefined &&
      current.startTimeMs !== options.target.startTimeMs
    ) {
      const reason = "Target PID was reused during PresentMon capture.";
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_PID_REUSED_DURING_CAPTURE",
        message: reason,
        details: {
          beforeStartTimeMs: options.target.startTimeMs,
          afterStartTimeMs: current.startTimeMs
        }
      });
      return reason;
    }
    return undefined;
  }

  private async cleanup(
    outputFilePath: string,
    retentionPlan: PresentMonCsvRetentionPlan,
    options: PresentMonSessionCaptureOptions,
    addDiagnostic: (input: Parameters<PcDiagnosticsTimeline["add"]>[0]) => PcDiagnosticEvent
  ): Promise<void> {
    const retention = await applyPresentMonCsvRetention(outputFilePath, retentionPlan);
    if (retention.action === "kept") {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "info",
        category: "presentmon",
        code: "PRESENTMON_CSV_RETAINED",
        message: "PresentMon CSV was retained according to the session retention policy.",
        details: {
          outputFilePath: retention.pathSanitized,
          retentionMode: retentionPlan.mode
        }
      });
      return;
    }
    if (retention.action === "deleted") {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "info",
        category: "presentmon",
        code: "PRESENTMON_CSV_DELETED",
        message: "PresentMon CSV was deleted after parsing.",
        details: {
          outputFilePath: retention.pathSanitized,
          retentionMode: retentionPlan.mode
        }
      });
      return;
    }
    if (retention.action === "delete_failed") {
      addDiagnostic({
        ...diagnosticBase(options),
        level: "warn",
        category: "presentmon",
        code: "PRESENTMON_CSV_RETAINED",
        message: "PresentMon CSV cleanup failed; path is sanitized in diagnostics.",
        details: {
          outputFilePath: retention.pathSanitized,
          warning: retention.warning
        }
      });
    }
  }

  private result(
    status: PresentMonCaptureResultStatus,
    startedAt: number,
    diagnostics: PcDiagnosticEvent[],
    warnings: string[],
    metrics: MetricEvent[],
    rawRowCount: number,
    matchedRowCount: number,
    outputFilePath?: string
  ): PresentMonCaptureResult {
    const result: PresentMonCaptureResult = {
      status,
      rawRowCount,
      matchedRowCount,
      metrics,
      diagnostics,
      warnings,
      durationMs: this.now() - startedAt,
      source: "PresentMon"
    };
    if (outputFilePath !== undefined) {
      result.outputFilePath = sanitizePcText(outputFilePath);
    }
    return result;
  }
}
