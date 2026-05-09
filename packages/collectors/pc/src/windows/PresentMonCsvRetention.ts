import { rm, stat } from "node:fs/promises";
import { sanitizePcText } from "../diagnostics/sanitizePcDiagnostic";

export type PresentMonCsvRetentionMode =
  | "delete_after_parse"
  | "keep_until_session_end"
  | "keep_user_requested";

export interface PresentMonCsvRetentionOptions {
  keepPresentMonCsv?: boolean;
  presentMonOutputDir?: string;
  cleanupOnSessionStop?: boolean;
  maxCsvSizeBytes?: number;
  retentionMode?: PresentMonCsvRetentionMode;
}

export interface PresentMonCsvRetentionPlan {
  mode: PresentMonCsvRetentionMode;
  keepCsv: boolean;
  cleanupOnSessionStop: boolean;
  maxCsvSizeBytes: number;
  outputDir?: string;
}

export interface PresentMonCsvRetentionResult {
  ok: boolean;
  action: "kept" | "deleted" | "skipped" | "rejected_oversize" | "delete_failed";
  pathSanitized: string;
  sizeBytes?: number;
  warning?: string;
}

const DEFAULT_MAX_CSV_SIZE_BYTES = 256 * 1024 * 1024;

export function buildPresentMonCsvRetentionPlan(
  options: PresentMonCsvRetentionOptions = {}
): PresentMonCsvRetentionPlan {
  const mode =
    options.retentionMode ??
    (options.keepPresentMonCsv === true ? "keep_user_requested" : "delete_after_parse");
  return {
    mode,
    keepCsv: options.keepPresentMonCsv === true || mode === "keep_user_requested",
    cleanupOnSessionStop: options.cleanupOnSessionStop ?? mode === "keep_until_session_end",
    maxCsvSizeBytes: options.maxCsvSizeBytes ?? DEFAULT_MAX_CSV_SIZE_BYTES,
    ...(options.presentMonOutputDir === undefined ? {} : { outputDir: options.presentMonOutputDir })
  };
}

export async function validatePresentMonCsvSize(
  filePath: string,
  plan: PresentMonCsvRetentionPlan
): Promise<PresentMonCsvRetentionResult> {
  const stats = await stat(filePath);
  if (stats.size > plan.maxCsvSizeBytes) {
    return {
      ok: false,
      action: "rejected_oversize",
      pathSanitized: sanitizePcText(filePath),
      sizeBytes: stats.size,
      warning: `PresentMon CSV exceeded the ${plan.maxCsvSizeBytes} byte safety limit.`
    };
  }
  return {
    ok: true,
    action: "skipped",
    pathSanitized: sanitizePcText(filePath),
    sizeBytes: stats.size
  };
}

export async function applyPresentMonCsvRetention(
  filePath: string,
  plan: PresentMonCsvRetentionPlan,
  deleteFile: (path: string) => Promise<void> = async (pathToDelete) => {
    await rm(pathToDelete, { force: true });
  }
): Promise<PresentMonCsvRetentionResult> {
  if (plan.keepCsv || plan.mode === "keep_until_session_end") {
    return {
      ok: true,
      action: "kept",
      pathSanitized: sanitizePcText(filePath)
    };
  }
  try {
    await deleteFile(filePath);
    return {
      ok: true,
      action: "deleted",
      pathSanitized: sanitizePcText(filePath)
    };
  } catch (error) {
    return {
      ok: false,
      action: "delete_failed",
      pathSanitized: sanitizePcText(filePath),
      warning: error instanceof Error ? error.message : String(error)
    };
  }
}
