import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CommandRunner, type CommandResult } from "@lumatrace/core";
import { sanitizeIosTraceDiagnostic } from "../diagnostics/sanitizeIosTraceDiagnostic";
import type {
  IosToolClient,
  IosXctraceCaptureOptions,
  IosXctraceCaptureResult
} from "../types";
import { importIosXctraceCsvMetrics } from "./IosTraceImport";
import {
  buildIosXctraceExportCommand,
  buildIosXctraceRecordCommand,
  normalizeIosXctraceDurationMs
} from "./IosXctraceCaptureCommand";

export interface IosXctraceCaptureRuntimeOptions {
  toolClient: IosToolClient;
  commandRunner?: CommandRunner;
  now?: () => number;
}

function commandSignalOption(signal: AbortSignal | undefined): { signal: AbortSignal } | Record<string, never> {
  return signal === undefined ? {} : { signal };
}

function commandFailedReason(result: CommandResult, action: string): string | undefined {
  if (result.aborted) {
    return `${action} was aborted.`;
  }
  if (result.timedOut) {
    return `${action} timed out.`;
  }
  if (result.exitCode !== 0) {
    return result.sanitizedStderr || result.errorMessage || `${action} failed with exit code ${result.exitCode}.`;
  }
  return undefined;
}

function summarizeCommand(result: CommandResult): Record<string, unknown> {
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    aborted: result.aborted,
    durationMs: result.durationMs,
    command: result.sanitizedCommand,
    stderr: result.sanitizedStderr.slice(0, 4096),
    stdout: result.sanitizedStdout.slice(0, 4096)
  };
}

export class IosXctraceCaptureRuntime {
  private readonly toolClient: IosToolClient;
  private readonly commandRunner: CommandRunner;
  private readonly now: () => number;

  constructor(options: IosXctraceCaptureRuntimeOptions) {
    this.toolClient = options.toolClient;
    this.commandRunner = options.commandRunner ?? new CommandRunner();
    this.now = options.now ?? (() => Date.now());
  }

  async capture(options: IosXctraceCaptureOptions): Promise<IosXctraceCaptureResult> {
    const tool = await this.toolClient.getToolStatus();
    const importedAtMs = options.importedAtMs ?? this.now();
    const captureId = options.captureId ?? `ios-xctrace-${importedAtMs}`;
    const durationMs = normalizeIosXctraceDurationMs(options.durationMs);
    if (tool.toolStatus.status !== "available" || tool.xcrunPath === undefined) {
      return this.result("unsupported", "xcrun is not available for automatic iOS xctrace capture.", {
        iosCode: "IOS_XCTRACE_UNAVAILABLE",
        toolStatus: tool.toolStatus
      });
    }

    const outputRoot =
      options.outputDir ?? (await mkdtemp(join(tmpdir(), "lumatrace-ios-xctrace-")));
    await mkdir(outputRoot, { recursive: true });
    const tracePath = join(outputRoot, `${captureId}.trace`);

    const recordCommand = buildIosXctraceRecordCommand({
      xcrunPath: tool.xcrunPath,
      udid: options.udid,
      outputTracePath: tracePath,
      durationMs,
      ...(options.target === undefined ? {} : { target: options.target }),
      ...(options.templateName === undefined ? {} : { templateName: options.templateName })
    });
    const record = await this.commandRunner.run({
      command: recordCommand.executable,
      args: recordCommand.args,
      timeoutMs: durationMs + 30_000,
      maxOutputBytes: 512 * 1024,
      ...commandSignalOption(options.signal),
      sensitiveValues: [tool.xcrunPath, options.udid, outputRoot, tracePath]
    });
    const recordFailure = commandFailedReason(record, "xctrace record");
    if (recordFailure !== undefined) {
      return this.result(record.aborted ? "aborted" : "failed", recordFailure, {
        iosCode: record.aborted ? "IOS_XCTRACE_CAPTURE_ABORTED" : "IOS_XCTRACE_CAPTURE_FAILED",
        recordCommand: recordCommand.sanitizedPreview,
        record: summarizeCommand(record)
      });
    }

    const tocCommand = buildIosXctraceExportCommand({
      xcrunPath: tool.xcrunPath,
      inputTracePath: tracePath,
      toc: true
    });
    const toc = await this.commandRunner.run({
      command: tocCommand.executable,
      args: tocCommand.args,
      timeoutMs: 30_000,
      maxOutputBytes: 512 * 1024,
      ...commandSignalOption(options.signal),
      sensitiveValues: [tool.xcrunPath, options.udid, outputRoot, tracePath]
    });

    const tocFailure = commandFailedReason(toc, "xctrace TOC export");
    if (tocFailure !== undefined) {
      return this.result(toc.aborted ? "aborted" : "trace_recorded", tocFailure, {
        iosCode: toc.aborted ? "IOS_XCTRACE_CAPTURE_ABORTED" : "IOS_XCTRACE_TOC_EXPORT_FAILED",
        recordCommand: recordCommand.sanitizedPreview,
        tocCommand: tocCommand.sanitizedPreview,
        tracePath: "<ios-xctrace-output>",
        record: summarizeCommand(record),
        toc: summarizeCommand(toc)
      });
    }

    if (options.exportXPath === undefined || options.exportXPath.trim().length === 0) {
      await this.cleanupTrace(outputRoot, options);
      return this.result(
        "trace_recorded",
        "Recorded an iOS xctrace file and exported the table of contents. Metric export XPath is not configured for this template yet.",
        {
          iosCode: "IOS_XCTRACE_RECORDED_TOC_ONLY",
          recordCommand: recordCommand.sanitizedPreview,
          tocCommand: tocCommand.sanitizedPreview,
          tracePath: "<ios-xctrace-output>",
          record: summarizeCommand(record),
          toc: {
            ...summarizeCommand(toc),
            stdoutPreview: toc.sanitizedStdout.slice(0, 2048)
          }
        }
      );
    }

    const exportCommand = buildIosXctraceExportCommand({
      xcrunPath: tool.xcrunPath,
      inputTracePath: tracePath,
      xpath: options.exportXPath
    });
    const exported = await this.commandRunner.run({
      command: exportCommand.executable,
      args: exportCommand.args,
      timeoutMs: 30_000,
      maxOutputBytes: 5 * 1024 * 1024,
      ...commandSignalOption(options.signal),
      sensitiveValues: [tool.xcrunPath, options.udid, outputRoot, tracePath]
    });
    const exportFailure = commandFailedReason(exported, "xctrace metric export");
    if (exportFailure !== undefined) {
      return this.result(exported.aborted ? "aborted" : "no_data", exportFailure, {
        iosCode: exported.aborted ? "IOS_XCTRACE_CAPTURE_ABORTED" : "IOS_XCTRACE_EXPORT_NO_DATA",
        recordCommand: recordCommand.sanitizedPreview,
        tocCommand: tocCommand.sanitizedPreview,
        exportCommand: exportCommand.sanitizedPreview,
        record: summarizeCommand(record),
        toc: summarizeCommand(toc),
        export: summarizeCommand(exported)
      });
    }

    const imported = importIosXctraceCsvMetrics(exported.stdout, {
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      targetId: options.targetId,
      traceStartedAtMs: options.traceStartedAtMs ?? importedAtMs,
      importedAtMs,
      captureId,
      ...(options.target === undefined ? {} : { target: options.target })
    });
    await this.cleanupTrace(outputRoot, options);

    const status = imported.metrics.length > 0 ? "success" : "no_data";
    return {
      status,
      metrics: imported.metrics,
      rawRowCount: imported.parse.rowCount,
      matchedRowCount: imported.match.matchedRows.length,
      metricCount: imported.metrics.length,
      matchStatus: imported.match.status,
      matchConfidence: imported.match.confidence,
      reason:
        imported.metrics.length > 0
          ? "Automatic iOS xctrace capture produced target-matched metrics."
          : imported.match.reason,
      warnings: imported.warnings,
      diagnostics: sanitizeIosTraceDiagnostic({
        iosCode: imported.metrics.length > 0 ? "IOS_XCTRACE_CAPTURE_COMPLETED" : "IOS_XCTRACE_CAPTURE_NO_DATA",
        rawRowCount: imported.parse.rowCount,
        matchedRowCount: imported.match.matchedRows.length,
        metricCount: imported.metrics.length,
        matchStatus: imported.match.status,
        matchConfidence: imported.match.confidence,
        warnings: imported.warnings,
        detectedColumns: imported.parse.detectedColumns,
        recordCommand: recordCommand.sanitizedPreview,
        tocCommand: tocCommand.sanitizedPreview,
        exportCommand: exportCommand.sanitizedPreview,
        record: summarizeCommand(record),
        toc: summarizeCommand(toc),
        export: summarizeCommand(exported)
      }) as Record<string, unknown>
    };
  }

  private result(
    status: IosXctraceCaptureResult["status"],
    reason: string,
    diagnostics: Record<string, unknown>
  ): IosXctraceCaptureResult {
    return {
      status,
      metrics: [],
      rawRowCount: 0,
      matchedRowCount: 0,
      metricCount: 0,
      reason,
      warnings: status === "success" ? [] : [reason],
      diagnostics: sanitizeIosTraceDiagnostic(diagnostics) as Record<string, unknown>
    };
  }

  private async cleanupTrace(outputRoot: string, options: IosXctraceCaptureOptions): Promise<void> {
    if (options.keepTrace === true || options.outputDir !== undefined) {
      return;
    }
    await rm(outputRoot, { recursive: true, force: true });
  }
}
