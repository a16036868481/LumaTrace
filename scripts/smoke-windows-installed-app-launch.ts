import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

interface InstallerDraftManifest {
  status?: string;
  unsigned?: boolean;
  installerBuilt?: boolean;
  productionReady?: boolean;
  installerArtifacts?: Array<{
    relativePath: string;
    sha256: string;
    sizeBytes: number;
  }>;
}

interface SmokeCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface InstalledLaunchSmokeManifest {
  schemaVersion: 1;
  generatedAt: string;
  status: "success" | "failed";
  launchMode: "nsis-silent-temp-install-launch";
  unsigned: true;
  productionReady: false;
  installerArtifact: {
    relativePath: string;
    sizeBytes: number;
    sha256: string;
  };
  installDirSanitized: "<temp-install-dir>";
  appExecutableRelativePath?: string;
  install: {
    exitCode: number | null;
    stdoutExcerptSanitized: string;
    stderrExcerptSanitized: string;
  };
  launch: {
    started: boolean;
    pidObserved: boolean;
    stayedRunningMs: number;
    exitCodeBeforeCleanup?: number | null;
    exitCodeAfterCleanup?: number | null;
    sidecarProcessObserved: boolean;
    sidecarProcessCount: number;
    stdoutExcerptSanitized: string;
    stderrExcerptSanitized: string;
  };
  cleanup: {
    appTerminationAttempted: boolean;
    appTerminated: boolean;
    uninstallExitCode: number | null;
    uninstalled: boolean;
    stdoutExcerptSanitized: string;
    stderrExcerptSanitized: string;
  };
  warnings: string[];
  limitations: string[];
}

interface ProcessInfo {
  ProcessId?: number;
  Name?: string;
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const installerDraftManifestPath = resolve(releaseDir, "lumatrace-installer-draft-manifest.json");
const installedLaunchManifestPath = resolve(releaseDir, "lumatrace-installed-app-launch-smoke-manifest.json");
const smokeTempRoot = realpathSync(tmpdir());
const smokeRoot = resolve(smokeTempRoot, `lumatrace-installed-launch-smoke-${process.pid}-${randomBytes(3).toString("hex")}`);
const installDir = resolve(smokeRoot, "install");

function removeSmokeRoot(): void {
  const target = resolve(smokeRoot);
  const child = relative(smokeTempRoot, target);
  if (!new RegExp(`^lumatrace-installed-launch-smoke-${process.pid}-[0-9a-f]{6}$`, "u").test(child)) {
    throw new Error("Refusing to remove a path outside the expected installed launch smoke temporary directory.");
  }
  if (existsSync(target)) {
    const entry = lstatSync(target);
    if (!entry.isDirectory() || entry.isSymbolicLink() || relative(smokeTempRoot, realpathSync(target)) !== child) {
      throw new Error("Refusing to remove a redirected installed launch smoke temporary directory.");
    }
  }
  rmSync(target, { recursive: true, force: true });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sanitizeText(input: string): string {
  return input
    .replaceAll(root, "<workspace>")
    .replaceAll(smokeRoot, "<installed-launch-smoke-temp>")
    .replace(/[A-Z]:\\Users\\[^\\\r\n]+(?:\\[^\r\n\s"]*)*/giu, "<local-path>")
    .replace(/\/(?:Users|home)\/[^\s"']+/giu, "<local-path>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, "Bearer <redacted>")
    .replace(/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/gu, "lumatrace-auth.<redacted>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "<email>")
    .replace(/\bat\s+[^\r\n]+:\d+:\d+/gu, "<stack-frame-redacted>");
}

function excerpt(input: string): string {
  const sanitized = sanitizeText(input);
  return sanitized.length > 4096 ? `${sanitized.slice(0, 4096)}\n<truncated>` : sanitized;
}

function runCommand(executable: string, args: string[], cwd: string): Promise<SmokeCommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolvePromise({ exitCode: 1, stdout, stderr: `${stderr}\n${error.name}: ${error.message}` });
    });
    child.on("exit", (exitCode) => resolvePromise({ exitCode, stdout, stderr }));
  });
}

async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  return await predicate();
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function findFile(files: string[], predicate: (file: string) => boolean): string | undefined {
  return files.find(predicate);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function listLikelySidecarProcesses(): Promise<ProcessInfo[]> {
  const installDirPattern = installDir.replaceAll("'", "''");
  const command = [
    "$ErrorActionPreference = 'SilentlyContinue';",
    "$CurrentQueryPid = $PID;",
    "Get-CimInstance Win32_Process",
    `| Where-Object { $_.ProcessId -ne $CurrentQueryPid -and ($_.Name -like '*lumatrace-local-server*' -or $_.CommandLine -like '*lumatrace-local-server*') -and $_.CommandLine -like '*${installDirPattern}*' }`,
    "| Select-Object -First 10 ProcessId,Name",
    "| ConvertTo-Json -Compress"
  ].join(" ");
  const result = await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], root);
  if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(result.stdout) as ProcessInfo | ProcessInfo[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function closeProcess(pid: number): Promise<boolean> {
  await runCommand(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `try { $p = Get-Process -Id ${pid} -ErrorAction Stop; [void]$p.CloseMainWindow() } catch { }`
    ],
    root
  );
  const closed = await waitUntil(() => !isProcessAlive(pid), 5_000, 250);
  if (closed) {
    return true;
  }
  await runCommand("taskkill.exe", ["/PID", String(pid), "/T", "/F"], root);
  return await waitUntil(() => !isProcessAlive(pid), 10_000, 500);
}

function writeManifest(manifest: InstalledLaunchSmokeManifest): void {
  mkdirSync(dirname(installedLaunchManifestPath), { recursive: true });
  writeFileSync(installedLaunchManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function assertCleanManifest(path: string): void {
  const text = readFileSync(path, "utf8");
  const checks: Array<[string, boolean]> = [
    ["no bearer token", !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text)],
    ["no auth subprotocol token", !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text)],
    ["no local user path", !/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(text)],
    ["no stack trace", !/\bat\s+[^\r\n]+:\d+:\d+/u.test(text)],
    ["no productionReady true", !/"productionReady"\s*:\s*true/u.test(text)]
  ];
  for (const [name, passed] of checks) {
    if (!passed) {
      throw new Error(`Installed app launch smoke manifest failed sanitizer check: ${name}`);
    }
  }
}

if (process.platform !== "win32") {
  console.error("Windows installed app launch smoke can only run on Windows.");
  process.exit(1);
}

if (!existsSync(installerDraftManifestPath)) {
  console.error("Installer draft manifest is missing. Run pnpm verify:windows-installer-draft first.");
  process.exit(1);
}

const draftManifest = readJson<InstallerDraftManifest>(installerDraftManifestPath);
const artifact = draftManifest.installerArtifacts?.[0];
if (
  draftManifest.status !== "success" ||
  draftManifest.unsigned !== true ||
  draftManifest.installerBuilt !== true ||
  draftManifest.productionReady !== false ||
  artifact === undefined
) {
  console.error("Installer draft manifest is not a successful unsigned draft.");
  process.exit(1);
}

const installerPath = resolve(releaseDir, artifact.relativePath);
if (!existsSync(installerPath) || sha256(installerPath) !== artifact.sha256 || statSync(installerPath).size !== artifact.sizeBytes) {
  console.error("Installer artifact is missing or does not match the draft manifest.");
  process.exit(1);
}

removeSmokeRoot();
mkdirSync(installDir, { recursive: true });

const warnings: string[] = [];
let installResult: SmokeCommandResult = { exitCode: 1, stdout: "", stderr: "" };
let cleanupStdout = "";
let cleanupStderr = "";
let uninstallExitCode: number | null = 1;
let appExe: string | undefined;
let appProcessPid: number | undefined;
let appProcessStarted = false;
let appPidObserved = false;
let appTerminated = false;
let sidecarProcesses: ProcessInfo[] = [];
let stayedRunningMs = 0;
let exitCodeBeforeCleanup: number | null | undefined;
let exitCodeAfterCleanup: number | null | undefined;
let appStdout = "";
let appStderr = "";
let uninstalled = false;
let cleanupStarted = false;

try {
  installResult = await runCommand(installerPath, ["/S", `/D=${installDir}`], releaseDir);
  if (installResult.exitCode !== 0) {
    throw new Error(`Silent installer exited with ${installResult.exitCode ?? "unknown"}`);
  }

  const files = walkFiles(installDir);
  appExe = findFile(files, (file) => /LumaTrace\.exe$/iu.test(file) || /lumatrace-desktop\.exe$/iu.test(file));
  const uninstaller = findFile(files, (file) => /uninstall.*\.exe$/iu.test(basename(file)));
  if (appExe === undefined) {
    throw new Error("Installed app executable was not found");
  }
  if (uninstaller === undefined) {
    throw new Error("Installed uninstaller was not found");
  }

  const launchedAt = Date.now();
  const appProcess = spawn(appExe, [], {
    cwd: dirname(appExe),
    windowsHide: false
  });
  appProcessStarted = true;
  appProcessPid = appProcess.pid;
  appProcess.stdout.on("data", (chunk: Buffer) => {
    appStdout += chunk.toString("utf8");
  });
  appProcess.stderr.on("data", (chunk: Buffer) => {
    appStderr += chunk.toString("utf8");
  });
  appProcess.on("exit", (exitCode) => {
    if (cleanupStarted) {
      exitCodeAfterCleanup = exitCode;
    } else {
      exitCodeBeforeCleanup = exitCode;
    }
  });
  appProcess.on("error", (error) => {
    appStderr += `\n${error.name}: ${error.message}`;
  });

  if (appProcessPid === undefined) {
    throw new Error("Installed app process did not expose a PID");
  }

  appPidObserved = await waitUntil(() => isProcessAlive(appProcessPid as number), 5_000, 250);
  if (!appPidObserved) {
    throw new Error("Installed app process was not observable after launch");
  }

  const remainedRunning = await waitUntil(() => !isProcessAlive(appProcessPid as number), 8_000, 500);
  stayedRunningMs = Date.now() - launchedAt;
  if (remainedRunning) {
    throw new Error(`Installed app exited during startup smoke with code ${exitCodeBeforeCleanup ?? "unknown"}`);
  }

  await waitUntil(async () => {
    sidecarProcesses = await listLikelySidecarProcesses();
    return sidecarProcesses.length > 0;
  }, 10_000, 1_000);
  if (sidecarProcesses.length === 0) {
    warnings.push("Installed app launch stayed running, but the smoke did not observe a local-server sidecar process.");
  }

  cleanupStarted = true;
  appTerminated = await closeProcess(appProcessPid);
  if (!appTerminated) {
    warnings.push("Installed app process did not terminate cleanly after close/kill attempts.");
  }

  const uninstallResult = await runCommand(uninstaller, ["/S", `_?=${installDir}`], installDir);
  uninstallExitCode = uninstallResult.exitCode;
  cleanupStdout = uninstallResult.stdout;
  cleanupStderr = uninstallResult.stderr;
  if (uninstallResult.exitCode !== 0) {
    warnings.push(`Silent uninstaller exited with ${uninstallResult.exitCode ?? "unknown"}`);
  }
  uninstalled = await waitUntil(() => !existsSync(appExe as string) || !existsSync(installDir), 15_000, 500);
  if (!uninstalled) {
    warnings.push("Install directory still exists after uninstall; cleanup removed the temporary directory.");
  }
} catch (error) {
  warnings.push(error instanceof Error ? error.message : String(error));
  if (appProcessPid !== undefined && isProcessAlive(appProcessPid)) {
    cleanupStarted = true;
    appTerminated = await closeProcess(appProcessPid);
  }
} finally {
  const status: InstalledLaunchSmokeManifest["status"] =
    installResult.exitCode === 0 && appProcessStarted && appPidObserved && stayedRunningMs >= 7_000 && appTerminated && uninstallExitCode === 0
      ? "success"
      : "failed";
  const smokeManifest: InstalledLaunchSmokeManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    launchMode: "nsis-silent-temp-install-launch",
    unsigned: true,
    productionReady: false,
    installerArtifact: {
      relativePath: artifact.relativePath,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256
    },
    installDirSanitized: "<temp-install-dir>",
    appExecutableRelativePath: appExe === undefined ? undefined : relative(installDir, appExe).replace(/\\/gu, "/"),
    install: {
      exitCode: installResult.exitCode,
      stdoutExcerptSanitized: excerpt(installResult.stdout),
      stderrExcerptSanitized: excerpt(installResult.stderr)
    },
    launch: {
      started: appProcessStarted,
      pidObserved: appPidObserved,
      stayedRunningMs,
      exitCodeBeforeCleanup,
      exitCodeAfterCleanup,
      sidecarProcessObserved: sidecarProcesses.length > 0,
      sidecarProcessCount: sidecarProcesses.length,
      stdoutExcerptSanitized: excerpt(appStdout),
      stderrExcerptSanitized: excerpt(appStderr)
    },
    cleanup: {
      appTerminationAttempted: appProcessPid !== undefined,
      appTerminated,
      uninstallExitCode,
      uninstalled,
      stdoutExcerptSanitized: excerpt(cleanupStdout),
      stderrExcerptSanitized: excerpt(cleanupStderr)
    },
    warnings,
    limitations: [
      "This smoke launches the unsigned installed app from a temporary install directory only.",
      "It checks bounded startup and optional sidecar process observation, not full interactive GUI behavior.",
      "It does not run production signing, updater validation, store distribution, or release approval.",
      "productionReady remains false."
    ]
  };
  writeManifest(smokeManifest);
  assertCleanManifest(installedLaunchManifestPath);
  removeSmokeRoot();
  if (smokeManifest.status !== "success") {
    console.error(`Windows installed app launch smoke failed. Manifest written to ${installedLaunchManifestPath}`);
    process.exit(1);
  }
}

console.log(`Windows installed app launch smoke manifest written to ${installedLaunchManifestPath}`);
console.log("Windows installed app launch smoke passed");
