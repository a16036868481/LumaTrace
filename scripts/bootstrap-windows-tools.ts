import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { CommandRunner } from "../packages/core/dist/src/index.js";
import {
  detectWindowsToolBootstrap,
  type WindowsToolBootstrapCommandResult,
  type WindowsToolBootstrapStatus
} from "../apps/local-server/src/diagnostics/windowsToolBootstrap.ts";

const INSTALL_ARGS = [
  "install",
  "-e",
  "--accept-package-agreements",
  "--accept-source-agreements",
  "--disable-interactivity",
  "--id"
];

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function statusLine(status: WindowsToolBootstrapStatus): string[] {
  const lines = [
    `platform: ${status.platform}`,
    `arch: ${status.arch}`,
    `winget: ${status.wingetAvailable ? status.wingetVersion ?? "available" : "missing"}`,
    `production bundling: disabled (${status.productionBundlingReason})`
  ];
  for (const tool of status.tools) {
    lines.push(
      `${tool.displayName}: ${tool.status}${tool.version === undefined ? "" : ` ${tool.version}`}${
        tool.pathSanitized === undefined ? "" : ` at ${tool.pathSanitized}`
      }`
    );
    if (!tool.available) {
      lines.push(`  install: ${tool.installPlan.commandPreview}`);
    }
  }
  for (const warning of status.warnings) {
    lines.push(`warning: ${warning}`);
  }
  return lines;
}

function publicStatus(status: WindowsToolBootstrapStatus): WindowsToolBootstrapStatus {
  return {
    ...status,
    tools: status.tools.map((tool) => {
      const { rawPath: _rawPath, ...rest } = tool;
      return rest;
    })
  };
}

async function runCommand(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; maxOutputBytes?: number }
): Promise<WindowsToolBootstrapCommandResult> {
  const runner = new CommandRunner();
  const result = await runner.run({
    command,
    args,
    timeoutMs: options?.timeoutMs ?? 120000,
    maxOutputBytes: options?.maxOutputBytes ?? 256 * 1024
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    ...(result.errorMessage === undefined ? {} : { errorMessage: result.errorMessage })
  };
}

async function installMissingTools(status: WindowsToolBootstrapStatus): Promise<void> {
  for (const tool of status.tools) {
    if (tool.available) {
      continue;
    }
    if (!tool.installPlan.available) {
      console.log(`Skipping ${tool.displayName}: ${tool.installPlan.reason}`);
      continue;
    }
    console.log(`Installing ${tool.displayName} with winget package ${tool.wingetPackageId}...`);
    const result = await runCommand("winget", [...INSTALL_ARGS, tool.wingetPackageId], {
      timeoutMs: 10 * 60 * 1000,
      maxOutputBytes: 1024 * 1024
    });
    if (result.exitCode !== 0) {
      console.log(`Install failed for ${tool.displayName}: ${(result.stderr || result.stdout || result.errorMessage) ?? "unknown error"}`);
    }
  }
}

async function setUserEnv(name: string, value: string): Promise<void> {
  const script = `[Environment]::SetEnvironmentVariable(${psQuote(name)}, ${psQuote(value)}, 'User')`;
  const result = await runCommand("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeoutMs: 10000,
    maxOutputBytes: 32 * 1024
  });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to set ${name}: ${(result.stderr || result.stdout || result.errorMessage) ?? "unknown error"}`);
  }
}

async function appendUserPath(entry: string): Promise<void> {
  const script = [
    `$entry = ${psQuote(entry)}`,
    "$current = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "if ([string]::IsNullOrWhiteSpace($current)) { $next = $entry } else {",
    "  $parts = $current -split ';' | Where-Object { $_ -ne '' }",
    "  if ($parts -contains $entry) { $next = $current } else { $next = ($parts + $entry) -join ';' }",
    "}",
    "[Environment]::SetEnvironmentVariable('Path', $next, 'User')"
  ].join("; ");
  const result = await runCommand("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeoutMs: 10000,
    maxOutputBytes: 32 * 1024
  });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to append user PATH: ${(result.stderr || result.stdout || result.errorMessage) ?? "unknown error"}`);
  }
}

async function configureFoundTools(status: WindowsToolBootstrapStatus): Promise<void> {
  for (const tool of status.tools) {
    if (!tool.available || tool.rawPath === undefined) {
      continue;
    }
    for (const action of tool.configurationActions) {
      if (action.kind === "set_user_env") {
        const platformTools = tool.id === "adb" ? dirname(tool.rawPath) : undefined;
        const sdkRoot = platformTools === undefined ? undefined : dirname(platformTools);
        const detectedPath =
          action.name === "LUMATRACE_ADB_PATH" || action.name === "LUMATRACE_PRESENTMON_PATH"
            ? tool.rawPath
            : action.name === "ANDROID_HOME" || action.name === "ANDROID_SDK_ROOT"
              ? sdkRoot
              : undefined;
        console.log(`Configuring ${action.name}: ${action.valueSanitized}`);
        if (detectedPath !== undefined && detectedPath.length > 0) {
          await setUserEnv(action.name, detectedPath);
        }
      } else if (action.kind === "append_user_path") {
        console.log(`Configuring user PATH: ${action.valueSanitized}`);
        await appendUserPath(dirname(tool.rawPath));
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = hasArg("--json");
  let status = await detectWindowsToolBootstrap({ commandRunner: runCommand });
  if (hasArg("--install")) {
    await installMissingTools(status);
    status = await detectWindowsToolBootstrap({ commandRunner: runCommand });
  }
  if (hasArg("--configure-env")) {
    await configureFoundTools(status).catch((error: unknown) => {
      console.log(`Configuration warning: ${error instanceof Error ? error.message : String(error)}`);
    });
    status = await detectWindowsToolBootstrap({ commandRunner: runCommand });
  }
  if (json) {
    console.log(JSON.stringify(publicStatus(status), null, 2));
  } else {
    console.log(statusLine(status).join("\n"));
    if (hasArg("--configure-env")) {
      console.log("Environment changes apply to newly opened terminals and newly launched app processes.");
    }
  }
}
