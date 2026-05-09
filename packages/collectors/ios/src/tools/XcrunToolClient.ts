import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { CommandRunner, type CommandResult } from "@lumatrace/core";
import { parseSimctlListApps } from "../parsers/parseSimctlListApps";
import { parseXctraceListDevices } from "../parsers/parseXctraceListDevices";
import type { IosAppInfo, IosDeviceInfo, IosToolClient, IosToolStatus } from "../types";

export interface XcrunToolClientOptions {
  commandRunner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  xcrunPath?: string;
}

export function parseXcrunVersion(output: string): string | undefined {
  return /xcrun\s+version\s+([0-9.]+)/iu.exec(output)?.[1];
}

async function exists(path: string): Promise<boolean> {
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
    const candidate = join(directory, "xcrun");
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export class XcrunToolClient implements IosToolClient {
  private readonly runner: CommandRunner;
  private readonly env: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly configuredPath: string | undefined;
  private resolved: Promise<IosToolStatus> | undefined;

  constructor(options: XcrunToolClientOptions = {}) {
    this.runner = options.commandRunner ?? new CommandRunner();
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.configuredPath = options.xcrunPath;
  }

  getToolStatus(): Promise<IosToolStatus> {
    this.resolved ??= this.resolveXcrun();
    return this.resolved;
  }

  async listDevices(): Promise<IosDeviceInfo[]> {
    const status = await this.getToolStatus();
    if (status.toolStatus.status !== "available" || status.xcrunPath === undefined) {
      return [];
    }
    const result = await this.runXcrun(status.xcrunPath, ["xctrace", "list", "devices"], 10000, 512 * 1024);
    if (result.exitCode !== 0 || result.timedOut) {
      return [];
    }
    return parseXctraceListDevices(result.stdout || result.stderr).devices;
  }

  async listSimulatorApps(udid: string): Promise<IosAppInfo[]> {
    const status = await this.getToolStatus();
    if (status.toolStatus.status !== "available" || status.xcrunPath === undefined) {
      return [];
    }
    const result = await this.runXcrun(status.xcrunPath, ["simctl", "listapps", udid, "--json"], 10000, 1024 * 1024);
    if (result.exitCode !== 0 || result.timedOut) {
      return [];
    }
    return parseSimctlListApps(result.stdout).apps;
  }

  private async resolveXcrun(): Promise<IosToolStatus> {
    if (this.platform !== "darwin") {
      return {
        toolStatus: {
          toolName: "xcrun",
          status: "unsupported",
          reason: "iOS Foundation requires macOS with Xcode command line tools. xcrun is not used on this platform.",
          suggestedAction: "Use macOS with Xcode for iOS discovery."
        }
      };
    }

    const candidates = [
      ...(this.configuredPath === undefined ? [] : [this.configuredPath]),
      ...(this.env.LUMATRACE_XCRUN_PATH === undefined ? [] : [this.env.LUMATRACE_XCRUN_PATH]),
      "/usr/bin/xcrun",
      ...((await findOnPath(this.env)) === undefined ? [] : [await findOnPath(this.env)])
    ].filter((candidate): candidate is string => candidate !== undefined && candidate.length > 0);

    for (const candidate of [...new Set(candidates)]) {
      if (!(await exists(candidate))) {
        continue;
      }
      const versionResult = await this.runXcrun(candidate, ["--version"], 3000, 64 * 1024);
      if (versionResult.exitCode !== 0 || versionResult.timedOut) {
        return {
          xcrunPath: candidate,
          toolStatus: {
            toolName: "xcrun",
            status: versionResult.timedOut ? "unknown" : "unsupported",
            reason: versionResult.timedOut
              ? "xcrun --version timed out."
              : versionResult.sanitizedStderr || versionResult.errorMessage || "xcrun --version failed.",
            suggestedAction: "Check Xcode command line tools installation."
          }
        };
      }
      const parsedVersion = parseXcrunVersion(versionResult.stdout || versionResult.stderr);
      return {
        xcrunPath: candidate,
        toolStatus: {
          toolName: "xcrun",
          status: "available",
          path: "<xcode-toolchain>/xcrun",
          ...(parsedVersion === undefined ? {} : { version: parsedVersion }),
          reason: "xcrun is available for iOS discovery.",
          suggestedAction: "Connect an iOS device or boot a simulator, then refresh devices."
        }
      };
    }

    return {
      toolStatus: {
        toolName: "xcrun",
        status: "missing",
        reason: "xcrun was not found. iOS discovery requires Xcode command line tools on macOS.",
        suggestedAction: "Install Xcode command line tools and ensure xcrun is available."
      }
    };
  }

  private runXcrun(
    xcrunPath: string,
    args: string[],
    timeoutMs: number,
    maxOutputBytes: number
  ): Promise<CommandResult> {
    return this.runner.run({
      command: xcrunPath,
      args,
      timeoutMs,
      maxOutputBytes,
      sensitiveValues: [xcrunPath]
    });
  }
}
