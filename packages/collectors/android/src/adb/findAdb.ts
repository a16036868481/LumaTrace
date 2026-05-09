import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { CommandRunner, type CommandResult, type ToolStatus } from "@lumatrace/core";
import { parseAdbVersion } from "./parseAdbVersion";

export interface FindAdbOptions {
  commandRunner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface FindAdbResult {
  adbPath?: string;
  toolStatus: ToolStatus;
  versionResult?: CommandResult;
}

function adbExecutableName(): string {
  return process.platform === "win32" ? "adb.exe" : "adb";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    const candidate = join(directory, adbExecutableName());
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function candidatePaths(env: NodeJS.ProcessEnv): Promise<string[]> {
  const candidates: string[] = [];
  if (env.LUMATRACE_ADB_PATH !== undefined && env.LUMATRACE_ADB_PATH.length > 0) {
    candidates.push(env.LUMATRACE_ADB_PATH);
  }
  for (const root of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) {
    if (root !== undefined && root.length > 0) {
      candidates.push(join(root, "platform-tools", adbExecutableName()));
    }
  }
  const pathAdb = await findOnPath(env);
  if (pathAdb !== undefined) {
    candidates.push(pathAdb);
  }
  return [...new Set(candidates)];
}

export async function findAdb(options: FindAdbOptions = {}): Promise<FindAdbResult> {
  const env = options.env ?? process.env;
  const commandRunner = options.commandRunner ?? new CommandRunner();
  const candidates = await candidatePaths(env);
  let adbPath: string | undefined;
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      adbPath = candidate;
      break;
    }
  }

  if (adbPath === undefined) {
    return {
      toolStatus: {
        toolName: "adb",
        status: "missing",
        reason: "adb was not found in LUMATRACE_ADB_PATH, ANDROID_HOME, ANDROID_SDK_ROOT, or PATH.",
        suggestedAction: "Install Android SDK Platform Tools and ensure adb is on PATH."
      }
    };
  }

  const result = await commandRunner.run({
    command: adbPath,
    args: ["version"],
    timeoutMs: options.timeoutMs ?? 3000,
    maxOutputBytes: options.maxOutputBytes ?? 64 * 1024,
    sensitiveValues: [adbPath]
  });

  if (result.exitCode !== 0) {
    return {
      adbPath,
      versionResult: result,
      toolStatus: {
        toolName: "adb",
        status: result.timedOut ? "unknown" : "unsupported",
        path: adbPath,
        reason: result.timedOut
          ? "adb version timed out."
          : result.sanitizedStderr || result.errorMessage || "adb version failed.",
        suggestedAction: "Check that Android SDK Platform Tools are installed correctly."
      }
    };
  }

  const versionInfo = parseAdbVersion(result.stdout);
  const status: ToolStatus = {
    toolName: "adb",
    status: "available",
    path: adbPath,
    reason: "adb is available.",
    suggestedAction: "Connect an Android device with USB debugging enabled."
  };
  const version = versionInfo.buildVersion ?? versionInfo.version;
  if (version !== undefined) {
    status.version = version;
  }
  return {
    adbPath,
    versionResult: result,
    toolStatus: status
  };
}
