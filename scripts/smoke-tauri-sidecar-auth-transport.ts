import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

interface WindowsProcessInfo {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine?: string | null;
}

interface WindowsProcessTreeInfo {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
}

interface WindowsProcessCommandLineInfo extends WindowsProcessTreeInfo {
  CommandLineBase64?: string | null;
}

interface TauriSidecarAuthTransportSmokeManifest {
  schemaVersion: 1;
  generatedAt: string;
  status: "success" | "failed";
  smokeKind: "tauri-dev-sidecar-auth-transport";
  unsigned: true;
  productionReady: false;
  devMode: true;
  checks: {
    desktopObserved: boolean;
    sidecarObserved: boolean;
    sidecarCommandLineContainsAuthArg: boolean;
    sidecarCommandLineContainsBearer: boolean;
    sidecarCommandLineContainsWsAuth: boolean;
    sidecarBindsLocalhost: boolean;
    sidecarBindsPublic: boolean;
  };
  evidence: {
    sidecarCommandLineRawIncluded: false;
    sidecarBinaryObserved: boolean;
    sidecarPackagedArgObserved: boolean;
    sidecarPortZeroObserved: boolean;
  };
  warnings: string[];
  limitations: string[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sanitize(text: string): string {
  const userProfile = process.env.USERPROFILE;
  let next = text
    .replace(/--auth-token\s+\S+/gi, "--auth-token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer <redacted>")
    .replace(/lumatrace-auth\.[A-Za-z0-9._~+/-]+/gi, "lumatrace-auth.<redacted>")
    .replace(/LUMATRACE_AUTH_TOKEN=[^\s"]+/gi, "LUMATRACE_AUTH_TOKEN=<redacted>")
    .replace(/\b[A-Za-z]:\\Users\\[^\\\s"]+/g, "<USER_PATH>")
    .replace(/\/Users\/[^/\s"]+/g, "<USER_PATH>")
    .replace(/\/home\/[^/\s"]+/g, "<USER_PATH>");
  if (userProfile !== undefined && userProfile.length > 0) {
    next = next.split(userProfile).join("<USER_PATH>");
  }
  return next.length > 4000 ? `${next.slice(0, 4000)}...<truncated>` : next;
}

function runPowerShell(script: string): string {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: "utf8",
      maxBuffer: 24 * 1024 * 1024,
      windowsHide: true
    }
  );
  if (result.status !== 0) {
    throw new Error(`PowerShell process query failed: ${sanitize(result.stderr || result.stdout)}`);
  }
  return result.stdout;
}

function listWindowsProcesses(): WindowsProcessInfo[] {
  const stdout = runPowerShell(
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress"
  ).trim();
  if (stdout.length === 0) {
    return [];
  }
  const parsed = JSON.parse(stdout) as WindowsProcessTreeInfo | WindowsProcessTreeInfo[];
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.map((entry) => ({ ...entry, CommandLine: undefined }));
}

function hydrateCommandLines(processes: WindowsProcessInfo[]): WindowsProcessInfo[] {
  if (processes.length === 0) {
    return processes;
  }
  const ids = processes.map((processInfo) => processInfo.ProcessId).filter((id) => Number.isInteger(id));
  const idList = ids.join(",");
  const stdout = runPowerShell(
    `$ids=@(${idList}); Get-CimInstance Win32_Process | Where-Object { $ids -contains [int]$_.ProcessId } | Select-Object ProcessId,ParentProcessId,Name,@{Name='CommandLineBase64';Expression={ if ($_.CommandLine) { [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([string]$_.CommandLine)) } else { '' } }} | ConvertTo-Json -Compress`
  ).trim();
  if (stdout.length === 0) {
    return processes;
  }
  let parsed: WindowsProcessCommandLineInfo | WindowsProcessCommandLineInfo[];
  try {
    parsed = JSON.parse(stdout) as WindowsProcessCommandLineInfo | WindowsProcessCommandLineInfo[];
  } catch {
    throw new Error("PowerShell command-line query returned malformed JSON.");
  }
  const commandLines = new Map<number, string>();
  for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
    const encoded = entry.CommandLineBase64 ?? "";
    commandLines.set(
      entry.ProcessId,
      encoded.length === 0 ? "" : Buffer.from(encoded, "base64").toString("utf8")
    );
  }
  return processes.map((processInfo) => ({
    ...processInfo,
    CommandLine: commandLines.get(processInfo.ProcessId) ?? ""
  }));
}

function descendantsOf(rootPid: number, processes: WindowsProcessInfo[]): WindowsProcessInfo[] {
  const byParent = new Map<number, WindowsProcessInfo[]>();
  for (const processInfo of processes) {
    const siblings = byParent.get(processInfo.ParentProcessId) ?? [];
    siblings.push(processInfo);
    byParent.set(processInfo.ParentProcessId, siblings);
  }

  const descendants: WindowsProcessInfo[] = [];
  const queue = [...(byParent.get(rootPid) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      continue;
    }
    descendants.push(current);
    queue.push(...(byParent.get(current.ProcessId) ?? []));
  }
  return descendants;
}

function hasForbiddenAuthTransport(commandLine: string): boolean {
  return (
    /--auth-token\b/i.test(commandLine) ||
    /Bearer\s+[A-Za-z0-9._~+/-]+/i.test(commandLine) ||
    /lumatrace-auth\./i.test(commandLine)
  );
}

function killTree(pid: number): void {
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
    windowsHide: true,
    stdio: "ignore"
  });
}

function tail(lines: string[], limit = 30): string {
  return sanitize(lines.slice(-limit).join("\n"));
}

if (process.platform !== "win32") {
  console.log("Tauri sidecar auth transport smoke skipped: Windows-only process inspection.");
  process.exit(0);
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const manifestPath = resolve(releaseDir, "lumatrace-tauri-sidecar-auth-transport-smoke-manifest.json");
const sidecarRust = readFileSync(resolve(root, "apps/desktop/src-tauri/src/sidecar.rs"), "utf8");
assert(sidecarRust.includes('command.env("LUMATRACE_AUTH_TOKEN"'), "Sidecar supervisor should pass token through env.");
assert(!sidecarRust.includes('.arg("--auth-token")'), "Sidecar supervisor must not pass token as a launch argument.");
assert(
  existsSync(resolve(root, "apps/desktop/src-tauri/binaries/lumatrace-local-server-x86_64-pc-windows-msvc.exe")),
  "Expected Windows sidecar artifact. Run pnpm build:self-contained-sidecar first."
);

const cargoBin = process.env.USERPROFILE === undefined ? undefined : resolve(process.env.USERPROFILE, ".cargo/bin");
const appDataNpm = process.env.APPDATA === undefined ? undefined : resolve(process.env.APPDATA, "npm");
const pathParts = [cargoBin, appDataNpm, process.env.PATH].filter(
  (value): value is string => value !== undefined && value.length > 0
);
const child = spawn("cmd.exe", ["/d", "/c", "pnpm dev:tauri"], {
  cwd: root,
  env: {
    ...process.env,
    PATH: pathParts.join(delimiter),
    NO_COLOR: "1"
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: false
});

const stdoutLines: string[] = [];
const stderrLines: string[] = [];
let observedDescendants: WindowsProcessInfo[] = [];
let smokeManifest: TauriSidecarAuthTransportSmokeManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: "failed",
  smokeKind: "tauri-dev-sidecar-auth-transport",
  unsigned: true,
  productionReady: false,
  devMode: true,
  checks: {
    desktopObserved: false,
    sidecarObserved: false,
    sidecarCommandLineContainsAuthArg: false,
    sidecarCommandLineContainsBearer: false,
    sidecarCommandLineContainsWsAuth: false,
    sidecarBindsLocalhost: false,
    sidecarBindsPublic: false
  },
  evidence: {
    sidecarCommandLineRawIncluded: false,
    sidecarBinaryObserved: false,
    sidecarPackagedArgObserved: false,
    sidecarPortZeroObserved: false
  },
  warnings: [],
  limitations: [
    "This smoke starts the Tauri dev app for bounded process observation only.",
    "It verifies sidecar auth transport and localhost binding, not full manual GUI behavior.",
    "It does not run production signing, updater validation, store distribution, or release approval.",
    "productionReady remains false."
  ]
};

function writeSmokeManifest(): void {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(smokeManifest, null, 2)}\n`, "utf8");
  const text = readFileSync(manifestPath, "utf8");
  assert(!/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text), "Smoke manifest must not include bearer tokens.");
  assert(!/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text), "Smoke manifest must not include WebSocket auth tokens.");
  assert(!/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(text), "Smoke manifest must not include auth-token launch args.");
  assert(!/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(text), "Smoke manifest must not include full local user paths.");
  assert(!/"productionReady"\s*:\s*true/u.test(text), "Smoke manifest must not claim production readiness.");
}

child.stdout.on("data", (chunk: Buffer) => {
  stdoutLines.push(...chunk.toString("utf8").split(/\r?\n/).filter(Boolean));
  stdoutLines.splice(0, Math.max(0, stdoutLines.length - 200));
});
child.stderr.on("data", (chunk: Buffer) => {
  stderrLines.push(...chunk.toString("utf8").split(/\r?\n/).filter(Boolean));
  stderrLines.splice(0, Math.max(0, stderrLines.length - 200));
});

try {
  let desktopObserved = false;
  let sidecarObserved = false;
  let sidecarCommandLine = "";
  let forbiddenCommandLine = "";
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    const processes = listWindowsProcesses();
    observedDescendants = hydrateCommandLines(descendantsOf(child.pid ?? -1, processes));
    desktopObserved = observedDescendants.some((processInfo) => /lumatrace-desktop\.exe/i.test(processInfo.Name));
    const sidecar = observedDescendants.find((processInfo) => {
      const commandLine = processInfo.CommandLine ?? "";
      return (
        /lumatrace-local-server/i.test(processInfo.Name) ||
        /lumatrace-local-server/i.test(commandLine)
      ) && /--packaged/.test(commandLine);
    });
    sidecarObserved = sidecar !== undefined;
    sidecarCommandLine = sidecar?.CommandLine ?? "";
    forbiddenCommandLine =
      observedDescendants.find((processInfo) => hasForbiddenAuthTransport(processInfo.CommandLine ?? ""))?.CommandLine ?? "";

    if (desktopObserved && sidecarObserved && forbiddenCommandLine.length === 0) {
      break;
    }
    if (forbiddenCommandLine.length > 0) {
      break;
    }
  }

  assert(child.pid !== undefined, "Expected pnpm dev:tauri process PID.");
  smokeManifest = {
    ...smokeManifest,
    checks: {
      desktopObserved,
      sidecarObserved,
      sidecarCommandLineContainsAuthArg: /--auth-token\b/i.test(sidecarCommandLine),
      sidecarCommandLineContainsBearer: /Bearer\s+/i.test(sidecarCommandLine),
      sidecarCommandLineContainsWsAuth: /lumatrace-auth\./i.test(sidecarCommandLine),
      sidecarBindsLocalhost: /--host\s+127\.0\.0\.1/.test(sidecarCommandLine),
      sidecarBindsPublic: /0\.0\.0\.0/.test(sidecarCommandLine)
    },
    evidence: {
      sidecarCommandLineRawIncluded: false,
      sidecarBinaryObserved: /lumatrace-local-server/i.test(sidecarCommandLine),
      sidecarPackagedArgObserved: /--packaged/.test(sidecarCommandLine),
      sidecarPortZeroObserved: /--port\s+0/.test(sidecarCommandLine)
    }
  };
  assert(desktopObserved, `Tauri desktop process was not observed.\nstdout:\n${tail(stdoutLines)}\nstderr:\n${tail(stderrLines)}`);
  assert(sidecarObserved, `Tauri sidecar process was not observed.\nstdout:\n${tail(stdoutLines)}\nstderr:\n${tail(stderrLines)}`);
  assert(forbiddenCommandLine.length === 0, `Forbidden auth material appeared in command line: ${sanitize(forbiddenCommandLine)}`);
  assert(/--host\s+127\.0\.0\.1/.test(sidecarCommandLine), "Sidecar command line should bind 127.0.0.1.");
  assert(!/0\.0\.0\.0/.test(sidecarCommandLine), "Sidecar command line must not bind 0.0.0.0.");
  assert(!hasForbiddenAuthTransport(sidecarCommandLine), "Sidecar command line must not include auth material.");
  smokeManifest.status = "success";

  console.log(
    JSON.stringify(
      {
        ok: true,
        desktopObserved,
        sidecarObserved,
        sidecarCommandLineContainsAuthArg: /--auth-token\b/i.test(sidecarCommandLine),
        sidecarCommandLineContainsBearer: /Bearer\s+/i.test(sidecarCommandLine),
        sidecarCommandLineContainsWsAuth: /lumatrace-auth\./i.test(sidecarCommandLine),
        sidecarBindsLocalhost: /--host\s+127\.0\.0\.1/.test(sidecarCommandLine)
      },
      null,
      2
    )
  );
} catch (error) {
  smokeManifest.warnings.push(error instanceof Error ? sanitize(error.message) : sanitize(String(error)));
  throw error;
} finally {
  if (child.pid !== undefined) {
    killTree(child.pid);
  }
  for (const processInfo of observedDescendants.sort((a, b) => b.ProcessId - a.ProcessId)) {
    killTree(processInfo.ProcessId);
  }
  writeSmokeManifest();
}

console.log(`Tauri sidecar auth transport smoke manifest written to ${manifestPath}`);
console.log("Tauri sidecar auth transport smoke passed");
