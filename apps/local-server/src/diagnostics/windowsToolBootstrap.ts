import { access, readdir } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";

export type WindowsToolBootstrapToolId = "adb" | "presentmon";

export interface WindowsToolBootstrapCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  errorMessage?: string;
}

export interface WindowsToolBootstrapCommandOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export type WindowsToolBootstrapCommandRunner = (
  command: string,
  args: string[],
  options?: WindowsToolBootstrapCommandOptions
) => Promise<WindowsToolBootstrapCommandResult>;

export interface WindowsToolBootstrapOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  pathExists?: (path: string) => Promise<boolean>;
  readDirectory?: (path: string) => Promise<string[]>;
  commandRunner?: WindowsToolBootstrapCommandRunner;
}

export interface WindowsToolInstallPlan {
  packageManager: "winget";
  packageId: string;
  commandPreview: string;
  available: boolean;
  reason: string;
}

export interface WindowsToolConfigurationAction {
  kind: "set_user_env" | "append_user_path";
  name: string;
  valueSanitized: string;
  reason: string;
}

export interface WindowsBootstrapToolStatus {
  id: WindowsToolBootstrapToolId;
  displayName: string;
  available: boolean;
  status: "available" | "missing" | "unsupported";
  rawPath?: string;
  pathSanitized?: string;
  version?: string;
  source?: "env" | "android-sdk" | "winget" | "path" | "common-dir";
  requiredFor: string;
  wingetPackageId: string;
  installPlan: WindowsToolInstallPlan;
  configurationActions: WindowsToolConfigurationAction[];
  suggestedAction: string;
}

export interface WindowsToolBootstrapStatus {
  platform: NodeJS.Platform;
  arch: string;
  wingetAvailable: boolean;
  wingetVersion?: string;
  tools: WindowsBootstrapToolStatus[];
  canInstallMissingTools: boolean;
  canConfigureFoundTools: boolean;
  productionBundlingAllowed: false;
  productionBundlingReason: string;
  warnings: string[];
  suggestedActions: string[];
}

interface ToolCandidate {
  path: string;
  source: NonNullable<WindowsBootstrapToolStatus["source"]>;
}

const ADB_WINGET_PACKAGE_ID = "Google.PlatformTools";
const PRESENTMON_WINGET_PACKAGE_ID = "Intel.PresentMon.Console";

function executableName(base: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? `${base}.exe` : base;
}

function sanitizeLocalPath(path: string): string {
  const normalized = path.replace(/\//g, "\\");
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length === 0) {
    return "<local-path>";
  }
  return `<local-path>\\${parts[parts.length - 1]}`;
}

function sanitizePathEntry(path: string): string {
  return sanitizeLocalPath(path);
}

function uniqueCandidates(candidates: ToolCandidate[]): ToolCandidate[] {
  const seen = new Set<string>();
  const result: ToolCandidate[] = [];
  for (const candidate of candidates) {
    const key = resolve(candidate.path).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultReadDirectory(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function pathDirectories(env: NodeJS.ProcessEnv): string[] {
  return (env.PATH ?? env.Path ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function buildAdbCandidates(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  readDirectory: (path: string) => Promise<string[]>
): Promise<ToolCandidate[]> {
  const adbName = executableName("adb", platform);
  const candidates: ToolCandidate[] = [];
  if (env.LUMATRACE_ADB_PATH !== undefined && env.LUMATRACE_ADB_PATH.length > 0) {
    candidates.push({ path: env.LUMATRACE_ADB_PATH, source: "env" });
  }
  for (const sdkRoot of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) {
    if (sdkRoot !== undefined && sdkRoot.length > 0) {
      candidates.push({ path: join(sdkRoot, "platform-tools", adbName), source: "android-sdk" });
    }
  }
  if (platform === "win32" && env.LOCALAPPDATA !== undefined) {
    candidates.push({
      path: join(env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", adbName),
      source: "android-sdk"
    });
    const winGetRoot = join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    const entries = await readDirectory(winGetRoot);
    for (const entry of entries) {
      if (!/Google\.PlatformTools|PlatformTools/i.test(entry)) {
        continue;
      }
      const base = join(winGetRoot, entry);
      candidates.push({ path: join(base, adbName), source: "winget" });
      candidates.push({ path: join(base, "platform-tools", adbName), source: "winget" });
    }
  }
  for (const directory of pathDirectories(env)) {
    candidates.push({ path: join(directory, adbName), source: "path" });
  }
  return uniqueCandidates(candidates);
}

async function buildPresentMonCandidates(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  readDirectory: (path: string) => Promise<string[]>
): Promise<ToolCandidate[]> {
  const exeName = executableName("PresentMon", platform);
  const lowerExeName = executableName("presentmon", platform);
  const candidates: ToolCandidate[] = [];
  if (env.LUMATRACE_PRESENTMON_PATH !== undefined && env.LUMATRACE_PRESENTMON_PATH.length > 0) {
    candidates.push({ path: env.LUMATRACE_PRESENTMON_PATH, source: "env" });
  }
  for (const directory of pathDirectories(env)) {
    candidates.push({ path: join(directory, exeName), source: "path" });
    candidates.push({ path: join(directory, lowerExeName), source: "path" });
  }
  if (platform === "win32") {
    for (const root of [
      env.LOCALAPPDATA === undefined ? undefined : join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages"),
      env.ProgramFiles,
      env["ProgramFiles(x86)"]
    ]) {
      if (root === undefined || root.length === 0) {
        continue;
      }
      const entries = await readDirectory(root);
      for (const entry of entries) {
        if (!/presentmon/i.test(entry)) {
          continue;
        }
        const base = join(root, entry);
        candidates.push({ path: join(base, exeName), source: "winget" });
        candidates.push({ path: join(base, lowerExeName), source: "winget" });
      }
    }
  }
  return uniqueCandidates(candidates);
}

function parseAdbVersion(output: string): string | undefined {
  return /Android Debug Bridge version\s+([^\s]+)/i.exec(output)?.[1];
}

function parsePresentMonVersion(output: string): string | undefined {
  return /PresentMon\s+([0-9][^\s]*)/i.exec(output)?.[1] ?? /version\s+([0-9][^\s]*)/i.exec(output)?.[1];
}

async function runVersion(
  commandRunner: WindowsToolBootstrapCommandRunner | undefined,
  command: string,
  args: string[],
  parse: (output: string) => string | undefined
): Promise<{ version?: string; unsupportedReason?: string }> {
  if (commandRunner === undefined) {
    return {};
  }
  const result = await commandRunner(command, args, {
    timeoutMs: 5000,
    maxOutputBytes: 64 * 1024
  }).catch((error: unknown): WindowsToolBootstrapCommandResult => ({
    exitCode: null,
    stdout: "",
    stderr: "",
    errorMessage: error instanceof Error ? error.message : String(error)
  }));
  const combined = `${result.stdout}\n${result.stderr}`;
  const version = parse(combined);
  if (version !== undefined) {
    return { version };
  }
  if (result.timedOut === true) {
    return { unsupportedReason: "Version command timed out." };
  }
  if (result.exitCode !== 0 && result.exitCode !== null) {
    return { unsupportedReason: "Version command did not return a parseable version." };
  }
  return {};
}

async function firstExistingCandidate(
  candidates: ToolCandidate[],
  pathExists: (path: string) => Promise<boolean>
): Promise<ToolCandidate | undefined> {
  for (const candidate of candidates) {
    if (await pathExists(candidate.path)) {
      return candidate;
    }
  }
  return undefined;
}

async function detectWinget(
  commandRunner: WindowsToolBootstrapCommandRunner | undefined,
  platform: NodeJS.Platform
): Promise<{ available: boolean; version?: string }> {
  if (platform !== "win32" || commandRunner === undefined) {
    return { available: false };
  }
  const result = await commandRunner("winget", ["--version"], {
    timeoutMs: 5000,
    maxOutputBytes: 16 * 1024
  }).catch((): WindowsToolBootstrapCommandResult => ({ exitCode: null, stdout: "", stderr: "" }));
  if (result.exitCode !== 0) {
    return { available: false };
  }
  const version = result.stdout.trim() || result.stderr.trim();
  return version.length > 0 ? { available: true, version } : { available: true };
}

function buildInstallPlan(
  packageId: string,
  wingetAvailable: boolean,
  label: string
): WindowsToolInstallPlan {
  return {
    packageManager: "winget",
    packageId,
    commandPreview: `winget install -e --id ${packageId} --accept-package-agreements --accept-source-agreements --disable-interactivity`,
    available: wingetAvailable,
    reason: wingetAvailable
      ? `${label} can be installed by the Windows installer bootstrap through winget.`
      : "winget is not available, so the installer bootstrap cannot install this tool automatically on this machine."
  };
}

function adbConfigurationActions(candidate: ToolCandidate | undefined): WindowsToolConfigurationAction[] {
  if (candidate === undefined) {
    return [];
  }
  const platformToolsDir = dirname(candidate.path);
  const sdkRoot = dirname(platformToolsDir);
  return [
    {
      kind: "set_user_env",
      name: "LUMATRACE_ADB_PATH",
      valueSanitized: sanitizeLocalPath(candidate.path),
      reason: "Lets LumaTrace find adb without relying on PATH."
    },
    {
      kind: "set_user_env",
      name: "ANDROID_HOME",
      valueSanitized: sanitizeLocalPath(sdkRoot),
      reason: "Lets Android tooling discover the SDK location."
    },
    {
      kind: "set_user_env",
      name: "ANDROID_SDK_ROOT",
      valueSanitized: sanitizeLocalPath(sdkRoot),
      reason: "Keeps compatibility with tools that use ANDROID_SDK_ROOT."
    },
    {
      kind: "append_user_path",
      name: "PATH",
      valueSanitized: sanitizePathEntry(platformToolsDir),
      reason: "Allows adb to work from a fresh terminal after installation."
    }
  ];
}

function presentMonConfigurationActions(candidate: ToolCandidate | undefined): WindowsToolConfigurationAction[] {
  if (candidate === undefined) {
    return [];
  }
  return [
    {
      kind: "set_user_env",
      name: "LUMATRACE_PRESENTMON_PATH",
      valueSanitized: sanitizeLocalPath(candidate.path),
      reason: "Lets LumaTrace find PresentMon without relying on PATH."
    }
  ];
}

export async function detectWindowsToolBootstrap(
  options: WindowsToolBootstrapOptions = {}
): Promise<WindowsToolBootstrapStatus> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const pathExists = options.pathExists ?? defaultPathExists;
  const readDirectory = options.readDirectory ?? defaultReadDirectory;
  const winget = await detectWinget(options.commandRunner, platform);

  const adbCandidate = await firstExistingCandidate(await buildAdbCandidates(env, platform, readDirectory), pathExists);
  const adbVersion =
    adbCandidate === undefined
      ? {}
      : await runVersion(options.commandRunner, adbCandidate.path, ["version"], parseAdbVersion);
  const presentMonCandidate = await firstExistingCandidate(
    await buildPresentMonCandidates(env, platform, readDirectory),
    pathExists
  );
  const presentMonVersion =
    presentMonCandidate === undefined
      ? {}
      : await runVersion(options.commandRunner, presentMonCandidate.path, ["--version"], parsePresentMonVersion);

  const adbStatus: WindowsBootstrapToolStatus = {
    id: "adb",
    displayName: "Android SDK Platform-Tools (adb)",
    available: adbCandidate !== undefined,
    status: adbCandidate === undefined ? "missing" : adbVersion.unsupportedReason === undefined ? "available" : "unsupported",
    ...(adbCandidate === undefined
      ? {}
      : { rawPath: adbCandidate.path, pathSanitized: sanitizeLocalPath(adbCandidate.path), source: adbCandidate.source }),
    ...(adbVersion.version === undefined ? {} : { version: adbVersion.version }),
    requiredFor: "Android device discovery and Android CPU/memory/battery/network/FPS probes.",
    wingetPackageId: ADB_WINGET_PACKAGE_ID,
    installPlan: buildInstallPlan(ADB_WINGET_PACKAGE_ID, winget.available, "Android SDK Platform-Tools"),
    configurationActions: adbConfigurationActions(adbCandidate),
    suggestedAction:
      adbCandidate === undefined
        ? "Install Android SDK Platform-Tools, then connect a phone with USB debugging enabled."
        : "adb is available. Connect an Android device and authorize USB debugging."
  };

  const presentMonStatus: WindowsBootstrapToolStatus = {
    id: "presentmon",
    displayName: "PresentMon Console",
    available: presentMonCandidate !== undefined,
    status:
      presentMonCandidate === undefined
        ? "missing"
        : presentMonVersion.unsupportedReason === undefined
          ? "available"
          : "unsupported",
    ...(presentMonCandidate === undefined
      ? {}
      : {
          rawPath: presentMonCandidate.path,
          pathSanitized: sanitizeLocalPath(presentMonCandidate.path),
          source: presentMonCandidate.source
        }),
    ...(presentMonVersion.version === undefined ? {} : { version: presentMonVersion.version }),
    requiredFor: "Windows FPS and frame-time capture.",
    wingetPackageId: PRESENTMON_WINGET_PACKAGE_ID,
    installPlan: buildInstallPlan(PRESENTMON_WINGET_PACKAGE_ID, winget.available, "PresentMon Console"),
    configurationActions: presentMonConfigurationActions(presentMonCandidate),
    suggestedAction:
      presentMonCandidate === undefined
        ? "Install PresentMon Console to enable explicit Windows FPS capture."
        : "PresentMon is available. FPS capture remains explicit and experimental."
  };

  const tools = [adbStatus, presentMonStatus];
  const missingTools = tools.filter((tool) => !tool.available);
  const warnings: string[] = [];
  if (platform !== "win32") {
    warnings.push("Windows tool bootstrap is only implemented for Windows installer/first-run flows.");
  }
  if (!winget.available) {
    warnings.push("winget is unavailable; the installer bootstrap can still configure found tools but cannot install missing tools.");
  }

  return {
    platform,
    arch,
    wingetAvailable: winget.available,
    ...(winget.version === undefined ? {} : { wingetVersion: winget.version }),
    tools,
    canInstallMissingTools: platform === "win32" && winget.available && missingTools.length > 0,
    canConfigureFoundTools: tools.some((tool) => tool.available && tool.configurationActions.length > 0),
    productionBundlingAllowed: false,
    productionBundlingReason:
      "LumaTrace does not bundle adb or PresentMon in production artifacts until license review, notices, signing, and release approval are complete.",
    warnings,
    suggestedActions:
      missingTools.length === 0
        ? ["All Windows optional tools are detected. Installer bootstrap can still configure environment variables."]
        : missingTools.map((tool) => tool.installPlan.available ? tool.installPlan.commandPreview : tool.suggestedAction)
  };
}
