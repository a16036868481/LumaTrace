import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { sanitizeCommandLog } from "@lumatrace/core";

export interface PackagedRuntimeOptions {
  packaged: boolean;
  host: string;
  port: number;
  dbPath: string;
  reportsDir?: string;
  diagnosticsDir?: string;
  logsDir?: string;
  sidecarManifestPath?: string;
  authToken?: string;
  parentPid?: number;
}

function readArgValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) {
    return args[index + 1];
  }
  const prefix = `${name}=`;
  const entry = args.find((arg) => arg.startsWith(prefix));
  return entry === undefined ? undefined : entry.slice(prefix.length);
}

function hasArg(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sanitizePackagedPath(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizeCommandLog(value);
}

export function ensurePackagedDirectories(options: PackagedRuntimeOptions): void {
  for (const directory of [options.reportsDir, options.diagnosticsDir, options.logsDir]) {
    if (directory !== undefined) {
      mkdirSync(directory, { recursive: true });
    }
  }
  mkdirSync(dirname(resolve(options.dbPath)), { recursive: true });
}

export function readPackagedEnv(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2)
): PackagedRuntimeOptions {
  const packaged = env.LUMATRACE_PACKAGED === "1" || hasArg(argv, "--packaged");
  const host = readArgValue(argv, "--host") ?? env.LUMATRACE_HOST ?? "127.0.0.1";
  const port = parseNumber(readArgValue(argv, "--port") ?? env.LUMATRACE_PORT, packaged ? 0 : 3100);
  const defaultDataDir = resolve(env.LOCALAPPDATA ?? env.TEMP ?? process.cwd(), "LumaTrace");
  const dbPath =
    readArgValue(argv, "--db-path") ??
    env.LUMATRACE_DB_PATH ??
    (packaged ? join(defaultDataDir, "lumatrace.db") : "lumatrace.sqlite");
  const reportsDir =
    readArgValue(argv, "--reports-dir") ??
    env.LUMATRACE_REPORTS_DIR ??
    (packaged ? join(defaultDataDir, "reports") : undefined);
  const diagnosticsDir =
    readArgValue(argv, "--diagnostics-dir") ??
    env.LUMATRACE_DIAGNOSTICS_DIR ??
    (packaged ? join(defaultDataDir, "diagnostics") : undefined);
  const logsDir =
    readArgValue(argv, "--logs-dir") ??
    env.LUMATRACE_LOGS_DIR ??
    (packaged ? join(defaultDataDir, "logs") : undefined);
  const sidecarManifestPath =
    readArgValue(argv, "--sidecar-manifest") ?? env.LUMATRACE_SIDECAR_MANIFEST;
  const authToken = readArgValue(argv, "--auth-token") ?? env.LUMATRACE_AUTH_TOKEN;
  const parentPid = parseNumber(readArgValue(argv, "--parent-pid"), 0);

  return {
    packaged,
    host,
    port,
    dbPath,
    ...(reportsDir === undefined ? {} : { reportsDir }),
    ...(diagnosticsDir === undefined ? {} : { diagnosticsDir }),
    ...(logsDir === undefined ? {} : { logsDir }),
    ...(sidecarManifestPath === undefined ? {} : { sidecarManifestPath }),
    ...(authToken === undefined ? {} : { authToken }),
    ...(parentPid > 0 ? { parentPid } : {})
  };
}

export function validatePackagedEnv(options: PackagedRuntimeOptions): void {
  if (!options.packaged) {
    return;
  }
  if (options.host !== "127.0.0.1") {
    throw new Error("Packaged mode must listen on 127.0.0.1.");
  }
  if (options.authToken === undefined || options.authToken.length < 16) {
    throw new Error("Packaged mode requires a local auth token.");
  }
}
