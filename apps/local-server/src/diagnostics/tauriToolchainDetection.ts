import { spawn } from "node:child_process";

export interface ToolchainCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export type ToolchainCommandRunner = (
  command: string,
  args: readonly string[]
) => Promise<ToolchainCommandResult>;

function quoteWindowsArg(value: string): string {
  if (!/[ \t"&|<>^]/.test(value)) {
    return value;
  }
  return `"${value.replace(/(["^&|<>])/g, "^$1")}"`;
}

function buildWindowsCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(quoteWindowsArg).join(" ");
}

export interface ToolchainStatus {
  rustAvailable: boolean;
  cargoVersion?: string;
  rustcVersion?: string;
  rustupVersion?: string;
  tauriCliAvailable: boolean;
  tauriCliVersion?: string;
  nodeVersion: string;
  pnpmVersion?: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  canRunTauriDev: boolean;
  canRunTauriBuild: boolean;
  missingTools: string[];
  suggestedActions: string[];
}

export const spawnToolchainCommand: ToolchainCommandRunner = async (command, args) =>
  new Promise<ToolchainCommandResult>((resolve) => {
    const child = process.platform === "win32" ? spawn("cmd.exe", ["/d", "/s", "/c", buildWindowsCommand(command, args)], {
      shell: false,
      windowsHide: true
    }) : spawn(command, [...args], {
      shell: false,
      windowsHide: true
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) =>
      resolve({
        ok: false,
        stdout: "",
        stderr: error.message
      })
    );
    child.on("close", (exitCode) =>
      resolve({
        ok: exitCode === 0,
        stdout: Buffer.concat(stdout).toString("utf8").trim(),
        stderr: Buffer.concat(stderr).toString("utf8").trim()
      })
    );
  });

async function readVersion(
  runCommand: ToolchainCommandRunner,
  command: string,
  args: readonly string[]
): Promise<string | undefined> {
  const result = await runCommand(command, args);
  return result.ok ? result.stdout || result.stderr || undefined : undefined;
}

export async function detectTauriToolchain(
  runCommand: ToolchainCommandRunner = spawnToolchainCommand
): Promise<ToolchainStatus> {
  const [cargoVersion, rustcVersion, rustupVersion, pnpmVersion] = await Promise.all([
    readVersion(runCommand, "cargo", ["--version"]),
    readVersion(runCommand, "rustc", ["--version"]),
    readVersion(runCommand, "rustup", ["--version"]),
    readVersion(runCommand, "pnpm", ["--version"])
  ]);

  const desktopPnpmTauriVersion = await readVersion(runCommand, "pnpm", [
    "--filter",
    "@lumatrace/desktop",
    "exec",
    "tauri",
    "--version"
  ]);
  const rootPnpmTauriVersion =
    desktopPnpmTauriVersion === undefined ? await readVersion(runCommand, "pnpm", ["exec", "tauri", "--version"]) : undefined;
  const cargoTauriVersion =
    desktopPnpmTauriVersion === undefined && rootPnpmTauriVersion === undefined
      ? await readVersion(runCommand, "cargo", ["tauri", "--version"])
      : undefined;
  const tauriCliVersion = desktopPnpmTauriVersion ?? rootPnpmTauriVersion ?? cargoTauriVersion;
  const missingTools: string[] = [];
  const suggestedActions: string[] = [];

  if (cargoVersion === undefined || rustcVersion === undefined) {
    missingTools.push("rust");
    suggestedActions.push("Install Rust from https://rustup.rs/ and reopen the terminal.");
  }
  if (tauriCliVersion === undefined) {
    missingTools.push("tauri-cli");
    suggestedActions.push("Install or enable the Tauri CLI before running pnpm dev:tauri or pnpm build:tauri.");
  }
  if (process.platform === "win32") {
    suggestedActions.push("Install Microsoft WebView2 Runtime if Windows does not already include it.");
  }

  const rustAvailable = cargoVersion !== undefined && rustcVersion !== undefined;
  const tauriCliAvailable = tauriCliVersion !== undefined;

  return {
    rustAvailable,
    ...(cargoVersion === undefined ? {} : { cargoVersion }),
    ...(rustcVersion === undefined ? {} : { rustcVersion }),
    ...(rustupVersion === undefined ? {} : { rustupVersion }),
    tauriCliAvailable,
    ...(tauriCliVersion === undefined ? {} : { tauriCliVersion }),
    nodeVersion: process.version,
    ...(pnpmVersion === undefined ? {} : { pnpmVersion }),
    platform: process.platform,
    arch: process.arch,
    canRunTauriDev: rustAvailable && tauriCliAvailable,
    canRunTauriBuild: rustAvailable && tauriCliAvailable,
    missingTools,
    suggestedActions
  };
}
