import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeCommandLog } from "@lumatrace/core";
import { sanitizeFileBaseName } from "@lumatrace/report";
import type { DiagnosticRecord } from "@lumatrace/storage";
import { sanitizePackagedDiagnostics } from "../diagnostics/sanitizePackagedDiagnostics";

export const SESSION_LOG_CONFIG_KEY = "exportLogsToReportDir";

export interface SessionLogWriteInput {
  outputDir: string;
  fileName: string;
  content: string;
}

export interface TimestampedSessionLogInput {
  diagnostics: readonly DiagnosticRecord[];
  generatedAtMs?: number;
}

export function shouldExportSessionLog(config: Record<string, unknown> | undefined): boolean {
  return config?.[SESSION_LOG_CONFIG_KEY] === true;
}

export function buildTimestampedSessionLog(input: TimestampedSessionLogInput): string {
  if (input.diagnostics.length === 0) {
    return `${new Date(input.generatedAtMs ?? Date.now()).toISOString()} INFO lumatrace No session events were recorded.\n`;
  }
  return `${input.diagnostics
    .map((record) => {
      const details = sanitizePackagedDiagnostics(record.details ?? {});
      const detailsText = Object.keys(details).length === 0 ? "" : ` ${JSON.stringify(details)}`;
      return sanitizeCommandLog(
        `${new Date(record.timestampMs).toISOString()} ${record.level.toUpperCase()} ${record.category} ${record.message}${detailsText}`
      );
    })
    .join("\n")}\n`;
}

export async function writeSessionLog(input: SessionLogWriteInput): Promise<string> {
  const requestedBaseName = input.fileName.replace(/\.log$/iu, "");
  const baseName = sanitizeFileBaseName(requestedBaseName);
  await mkdir(input.outputDir, { recursive: true });
  const outputPath = join(input.outputDir, `${baseName}.log`);
  const sanitized = sanitizeCommandLog(input.content).replace(/\r\n/gu, "\n");
  await writeFile(outputPath, sanitized.endsWith("\n") ? sanitized : `${sanitized}\n`, "utf8");
  return outputPath;
}
