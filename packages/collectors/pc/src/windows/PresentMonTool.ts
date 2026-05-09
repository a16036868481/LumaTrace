import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { CommandRunner, ToolStatus } from "@lumatrace/core";
import { CommandRunner as DefaultCommandRunner } from "@lumatrace/core";
import type { PresentMonToolStatus, PresentMonVersionInfo } from "../types";
import { sanitizePcText } from "../diagnostics/sanitizePcDiagnostic";
import { applyWindowsCommandPolicy, WINDOWS_COMMAND_POLICIES } from "./WindowsCommandPolicy";
import { buildWindowsExecutableCandidates, splitPathEnv } from "./WindowsToolDetection";
import { detectPresentMonCompatibility, type PresentMonCompatibility } from "./PresentMonVersionCompatibility";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function parsePresentMonVersion(output: string): PresentMonVersionInfo {
  const versionMatch =
    /(?:PresentMon(?:\s+(?:version|v))?\s*[: ]\s*|(?:version|v)\s*[: ]\s*)([0-9]+(?:\.[0-9]+){1,3})/iu.exec(
      output
    );
  return {
    ...(versionMatch?.[1] === undefined ? {} : { version: versionMatch[1] }),
    rawOutput: output
  };
}

async function buildWinGetPresentMonCandidates(env: NodeJS.ProcessEnv): Promise<string[]> {
  const localAppData = env.LOCALAPPDATA;
  if (localAppData === undefined || localAppData.trim().length === 0) {
    return [];
  }

  const packagesRoot = path.join(localAppData, "Microsoft", "WinGet", "Packages");
  let entries: Array<{ isDirectory: () => boolean; name: string }>;
  try {
    entries = await readdir(packagesRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && /PresentMon/iu.test(entry.name))
    .flatMap((entry) => [
      path.join(packagesRoot, entry.name, "PresentMon.exe"),
      path.join(packagesRoot, entry.name, "presentmon.exe")
    ]);
}

export interface PresentMonToolOptions {
  commandRunner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  presentMonPath?: string;
}

export class PresentMonTool {
  private readonly runner: CommandRunner;
  private readonly env: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly configuredPath: string | undefined;

  constructor(options: PresentMonToolOptions = {}) {
    this.runner = options.commandRunner ?? new DefaultCommandRunner();
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.configuredPath = options.presentMonPath;
  }

  async findPresentMon(): Promise<PresentMonToolStatus> {
    if (this.platform !== "win32") {
      return {
          toolStatus: {
            toolName: "PresentMon",
            status: "unsupported",
            reason: "PresentMon capture is only available on Windows in Milestone 3B.",
            suggestedAction: "Use Windows for explicit PresentMon CSV capture."
        }
      };
    }

    const envPath = this.configuredPath ?? this.env.LUMATRACE_PRESENTMON_PATH;
    const candidates = [
      ...(envPath === undefined ? [] : [envPath]),
      ...buildWindowsExecutableCandidates("PresentMon", splitPathEnv(this.env.PATH)),
      ...(await buildWinGetPresentMonCandidates(this.env)),
      "tools\\PresentMon\\PresentMon.exe",
      "C:\\Program Files\\PresentMon\\PresentMon.exe"
    ];
    const found = candidates.find((candidate) => candidate.length > 0);
    for (const candidate of candidates) {
      if (await exists(candidate)) {
        const version = await this.getPresentMonVersion(candidate);
        return {
          presentMonPath: candidate,
          toolStatus: {
            toolName: "PresentMon",
            status: "available",
            path: sanitizePcText(candidate),
            ...(version.version === undefined ? {} : { version: version.version }),
            reason: "PresentMon executable was found. PC FPS/frame-time capture remains explicit and experimental.",
            suggestedAction: "Enable PresentMon capture only for PC process sessions where FPS/frame-time data is needed."
          }
        };
      }
    }
    const toolStatus: ToolStatus = {
      toolName: "PresentMon",
      status: "missing",
      reason: "PresentMon was not found. PC CPU/memory sampling still works.",
      suggestedAction: "Install PresentMon or set LUMATRACE_PRESENTMON_PATH for explicit FPS/frame-time capture."
    };
    if (found !== undefined) {
      toolStatus.path = sanitizePcText(found);
    }
    return { toolStatus };
  }

  async getPresentMonVersion(presentMonPath: string): Promise<PresentMonVersionInfo> {
    const result = await this.runner.run(
      applyWindowsCommandPolicy(
        {
          command: presentMonPath,
          args: ["--version"]
        },
        WINDOWS_COMMAND_POLICIES.presentmon_version
      )
    );
    const output =
      result.stdout || result.stderr || result.sanitizedStdout || result.sanitizedStderr || "PresentMon version output unavailable.";
    const parsed = parsePresentMonVersion(output);
    if (parsed.version !== undefined) {
      return parsed;
    }
    if (result.exitCode !== 0 || result.timedOut) {
      return {
        rawOutput: output
      };
    }
    return parsed;
  }

  async getPresentMonHelp(presentMonPath: string): Promise<string> {
    const result = await this.runner.run(
      applyWindowsCommandPolicy(
        {
          command: presentMonPath,
          args: ["--help"]
        },
        WINDOWS_COMMAND_POLICIES.presentmon_help
      )
    );
    return result.stdout || result.stderr || result.sanitizedStdout || result.sanitizedStderr;
  }

  async getPresentMonCompatibility(presentMonPath: string): Promise<PresentMonCompatibility> {
    const [version, help] = await Promise.all([
      this.getPresentMonVersion(presentMonPath),
      this.getPresentMonHelp(presentMonPath).catch(() => "")
    ]);
    return detectPresentMonCompatibility(version.rawOutput, help);
  }
}
