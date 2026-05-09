import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { sanitizePackagedDiagnosticText } from "./sanitizePackagedDiagnostics";

export interface LogRotationPolicy {
  maxFileSizeBytes: number;
  maxFiles: number;
  rotateOnStartup: boolean;
  rotateWhenThresholdExceeded: boolean;
  deleteOldest: boolean;
}

export interface LogFileMetadata {
  name: string;
  sizeBytes: number;
  rotated: boolean;
  excerpt?: string;
}

export interface LogRotationResult {
  ok: boolean;
  rotatedFiles: string[];
  warnings: string[];
}

export const DEFAULT_LOG_ROTATION_POLICY: LogRotationPolicy = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFiles: 5,
  rotateOnStartup: true,
  rotateWhenThresholdExceeded: true,
  deleteOldest: true
};

const KNOWN_LOG_FILES = [
  "app.log",
  "local-server.log",
  "sidecar-supervisor.log",
  "packaging-diagnostics.log"
] as const;

function rotatedPath(logsDir: string, name: string, index: number): string {
  return join(logsDir, `${name}.${index}`);
}

function rotateOneLog(logsDir: string, name: string, policy: LogRotationPolicy): boolean {
  const path = join(logsDir, name);
  if (!existsSync(path)) {
    return false;
  }
  if (statSync(path).size <= policy.maxFileSizeBytes) {
    return false;
  }

  if (policy.deleteOldest) {
    const oldest = rotatedPath(logsDir, name, policy.maxFiles);
    if (existsSync(oldest)) {
      rmSync(oldest, { force: true });
    }
  }

  for (let index = policy.maxFiles - 1; index >= 1; index -= 1) {
    const source = rotatedPath(logsDir, name, index);
    const target = rotatedPath(logsDir, name, index + 1);
    if (existsSync(source)) {
      renameSync(source, target);
    }
  }
  renameSync(path, rotatedPath(logsDir, name, 1));
  writeFileSync(path, "", "utf8");
  return true;
}

export function rotateLogs(
  logsDir: string | undefined,
  policy: LogRotationPolicy = DEFAULT_LOG_ROTATION_POLICY
): LogRotationResult {
  const result: LogRotationResult = {
    ok: true,
    rotatedFiles: [],
    warnings: []
  };
  if (logsDir === undefined) {
    return result;
  }
  try {
    mkdirSync(logsDir, { recursive: true });
    for (const name of KNOWN_LOG_FILES) {
      if (rotateOneLog(logsDir, name, policy)) {
        result.rotatedFiles.push(name);
      }
    }
  } catch (error) {
    result.ok = false;
    result.warnings.push(error instanceof Error ? error.message : "log rotation failed");
  }
  return result;
}

export function collectLogMetadata(logsDir: string | undefined, includeExcerpts = false): LogFileMetadata[] {
  if (logsDir === undefined || !existsSync(logsDir)) {
    return [];
  }
  return readdirSync(logsDir)
    .filter((entry) => entry.endsWith(".log") || /\.log\.\d+$/u.test(entry))
    .map((entry) => {
      const fullPath = join(logsDir, entry);
      let sizeBytes = 0;
      try {
        sizeBytes = statSync(fullPath).size;
      } catch {
        sizeBytes = 0;
      }
      const metadata: LogFileMetadata = {
        name: basename(entry),
        sizeBytes,
        rotated: /\.log\.\d+$/u.test(entry)
      };
      if (includeExcerpts) {
        try {
          metadata.excerpt = sanitizeLogExcerpt(readFileSync(fullPath, "utf8"));
        } catch {
          metadata.excerpt = "N/A";
        }
      }
      return metadata;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function sanitizeLogExcerpt(text: string): string {
  return sanitizePackagedDiagnosticText(text)?.slice(0, 4096) ?? "";
}
