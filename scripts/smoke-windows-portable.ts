import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

interface SidecarManifest {
  artifactKind: string;
  fileName: string;
  runtimeDirectory: string;
  nodeRequired: boolean;
  sha256: string;
}

interface Device {
  id: string;
  tags?: { source?: string };
}

interface Session {
  id: string;
  status: string;
}

interface Metric {
  source?: string;
  precision?: string;
  confidence?: string;
}

interface ReportDocument {
  rawMetricCount: number;
  metrics: Metric[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function contained(root: string, path: string): string {
  const target = resolve(path);
  const child = relative(resolve(root), target);
  assert(child.length > 0 && child !== ".." && !child.startsWith("..\\") && !child.startsWith("../") && !isAbsolute(child), "Path escaped the expected package or smoke directory.");
  return target;
}

function assertRegularFile(path: string): void {
  assert(existsSync(path), "A required portable package file is missing.");
  const entry = lstatSync(path);
  assert(entry.isFile() && !entry.isSymbolicLink(), "A required package file is not a regular file.");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertMockMetrics(metrics: Metric[]): void {
  assert(metrics.length > 0, "The mock session did not produce any metrics.");
  assert(metrics.every((metric) => metric.source === "mock" && metric.precision !== undefined && metric.confidence !== undefined), "Smoke metrics must retain an explicit mock source, precision, and confidence.");
}

function regularFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = contained(root, join(root, entry.name));
    assert(!entry.isSymbolicLink(), "Smoke output unexpectedly contains a redirected entry.");
    if (entry.isDirectory()) files.push(...regularFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const argumentsList = process.argv.slice(2);
assert(process.platform === "win32", "This smoke test requires Windows.");
assert(argumentsList.length === 2 && argumentsList[0] === "--package-dir" && argumentsList[1]?.length > 0,
  "Usage: node --experimental-strip-types scripts/smoke-windows-portable.ts --package-dir <extracted-portable-directory>");
const packageDir = realpathSync(resolve(argumentsList[1]));
const portableManifestPath = contained(packageDir, join(packageDir, "portable-manifest.json"));
assertRegularFile(portableManifestPath);
const portableManifest = JSON.parse(readFileSync(portableManifestPath, "utf8")) as { version: string; entrypoint: string; nodeRequired: boolean };
assert(portableManifest.entrypoint === "lumatrace-desktop.exe" && portableManifest.nodeRequired === false, "Expected an extracted self-contained portable package.");
const desktopPath = contained(packageDir, join(packageDir, portableManifest.entrypoint));
assertRegularFile(desktopPath);
const binariesDir = contained(packageDir, join(packageDir, "binaries"));
const sidecarManifestPath = contained(binariesDir, join(binariesDir, "sidecar-manifest.json"));
assertRegularFile(sidecarManifestPath);
const sidecarManifest = JSON.parse(readFileSync(sidecarManifestPath, "utf8")) as SidecarManifest;
assert(sidecarManifest.artifactKind === "self-contained" && sidecarManifest.nodeRequired === false, "Portable sidecar must not require system Node.js.");
assert(basename(sidecarManifest.fileName) === sidecarManifest.fileName && basename(sidecarManifest.runtimeDirectory) === sidecarManifest.runtimeDirectory, "Sidecar resource names must be simple package-relative names.");
const sidecarPath = contained(binariesDir, join(binariesDir, sidecarManifest.fileName));
const runtimeDir = contained(binariesDir, join(binariesDir, sidecarManifest.runtimeDirectory));
assertRegularFile(sidecarPath);
assert(sha256(sidecarPath) === sidecarManifest.sha256, "The packaged sidecar does not match its recorded SHA-256.");
for (const path of [join(runtimeDir, "node.exe"), join(runtimeDir, "app/dist/src/index.js"), join(runtimeDir, "app/scripts/register-esm-loader.mjs")]) assertRegularFile(path);

const tempBase = resolve("D:\\LumaTraceTemp");
mkdirSync(tempBase, { recursive: true });
assert(!lstatSync(tempBase).isSymbolicLink(), "The smoke temporary root must not be redirected.");
const smokeRoot = mkdtempSync(join(realpathSync(tempBase), "lumatrace-portable-smoke-"));
const reportsDir = contained(smokeRoot, join(smokeRoot, "reports"));
const diagnosticsDir = contained(smokeRoot, join(smokeRoot, "diagnostics"));
const logsDir = contained(smokeRoot, join(smokeRoot, "logs"));
const dbPath = contained(smokeRoot, join(smokeRoot, "data/lumatrace.db"));
const localAppData = contained(smokeRoot, join(smokeRoot, "local-app-data"));
for (const directory of [reportsDir, diagnosticsDir, logsDir, join(smokeRoot, "data"), localAppData]) mkdirSync(directory, { recursive: true });
const token = randomBytes(32).toString("hex");
const checks: string[] = [];
let stdout = "";
let stderr = "";
let capturedOutputBytes = 0;
let spawnedError = false;
let baseUrl: string | undefined;
let resultError: string | undefined;
let metricCount = 0;
let normalShutdown = false;
const outputs: string[] = [];
const child = spawn(sidecarPath, [
  "--packaged", "--host", "127.0.0.1", "--port", "0", "--db-path", dbPath,
  "--reports-dir", reportsDir, "--diagnostics-dir", diagnosticsDir, "--logs-dir", logsDir,
  "--sidecar-manifest", sidecarManifestPath, "--parent-pid", String(process.pid)
], {
  cwd: smokeRoot,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
    windir: process.env.SystemRoot ?? "C:\\Windows",
    TEMP: smokeRoot,
    TMP: smokeRoot,
    LOCALAPPDATA: localAppData,
    PATH: "",
    LUMATRACE_SIDECAR_RUNTIME_DIR: runtimeDir,
    LUMATRACE_AUTH_TOKEN: token
  }
});
child.on("error", () => { spawnedError = true; });
for (const [stream, kind] of [[child.stdout, "stdout"], [child.stderr, "stderr"]] as const) {
  stream.on("data", (chunk: Buffer) => {
    capturedOutputBytes += chunk.byteLength;
    if (capturedOutputBytes <= 1_048_576) {
      if (kind === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    }
  });
}

function passed(message: string): void {
  checks.push(message);
  console.log(`[ok] ${message}`);
}

function alive(): boolean {
  return !spawnedError && child.exitCode === null && child.signalCode === null;
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((complete) => setTimeout(complete, 100));
  }
  return await predicate();
}

async function request(path: string, init: RequestInit = {}, credential = token): Promise<Response> {
  assert(baseUrl !== undefined, "The isolated sidecar is not ready.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${credential}`);
  return await fetch(`${baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(60_000) });
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);
  assert(response.ok, `Portable smoke API request failed with HTTP ${response.status}.`);
  const payload = await response.json() as { ok?: boolean; data?: T };
  assert(payload.ok === true && payload.data !== undefined, "Portable smoke API returned an invalid envelope.");
  return payload.data;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Portable smoke failed with an unknown error.";
  return message.replaceAll(token, "<redacted>").replaceAll(packageDir, "<portable-package>").replaceAll(smokeRoot, "<smoke-temp>")
    .replace(/[A-Z]:[\\/]Users[\\/][^\s\r\n"']+/giu, "<user-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "<email>");
}

try {
  const ready = await waitFor(() => {
    assert(!spawnedError, "Failed to launch the packaged sidecar.");
    assert(alive(), "The packaged sidecar exited before readiness.");
    for (const line of stdout.split(/\r?\n/u).slice(0, -1)) {
      if (!line.startsWith("{") || !line.includes('"lumatrace.local-server.ready"')) continue;
      const message = JSON.parse(line) as { type?: string; host?: string; port?: number };
      if (message.type === "lumatrace.local-server.ready") {
        assert(message.host === "127.0.0.1" && Number.isInteger(message.port) && Number(message.port) > 0 && Number(message.port) <= 65535, "Portable sidecar must expose a valid loopback listener.");
        baseUrl = `http://127.0.0.1:${message.port}`;
        return true;
      }
    }
    return false;
  }, 90_000);
  assert(ready, "Timed out waiting for packaged sidecar readiness.");
  passed("Packaged sidecar starts with an empty PATH and isolated D-drive storage");

  const status = await api<{ artifactKind: string; authRequired: boolean; storage: { migrationStatus: string } }>("/api/packaged/status");
  assert(status.artifactKind === "self-contained" && status.authRequired === true && status.storage.migrationStatus === "ok", "Packaged runtime or database migration status is invalid.");
  assert(!JSON.stringify(status).includes(token), "Packaged status exposed its authentication token.");
  passed("Valid authentication and isolated database migrations");
  const unauthorized = await request("/api/packaged/status", {}, "invalid-portable-smoke-credential");
  assert(unauthorized.status === 401, "Incorrect authentication must return HTTP 401.");
  await unauthorized.arrayBuffer();
  passed("Incorrect authentication returns HTTP 401");

  const devices = await api<Device[]>("/api/devices");
  const device = devices.find((item) => item.id.startsWith("mock-") && item.tags?.source === "mock") ?? devices.find((item) => item.id === "mock-local-device-1");
  assert(device !== undefined, "The packaged application is missing its mock device.");
  const targets = await api<Array<{ id: string }>>(`/api/devices/${encodeURIComponent(device.id)}/targets`);
  assert(targets[0] !== undefined, "The mock device has no test target.");
  passed("Mock device and target discovery");
  const session = await api<Session>("/api/sessions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Portable package mock smoke", deviceId: device.id, targetId: targets[0].id, sampleIntervalMs: 50, config: { profileName: "janky_game" } })
  });
  assert(session.status === "created", "The mock test was not created.");
  const sessionPath = `/api/sessions/${encodeURIComponent(session.id)}`;
  const running = await api<Session>(`${sessionPath}/start`, { method: "POST" });
  assert(running.status === "running", "The mock test did not start.");
  let metrics: Metric[] = [];
  const collected = await waitFor(async () => {
    metrics = await api<Metric[]>(`${sessionPath}/metrics?limit=100`);
    return metrics.length >= 4;
  }, 20_000);
  assert(collected, "The mock test did not persist metrics in time.");
  assertMockMetrics(metrics);
  passed("Mock test starts and persists explicitly labeled mock metrics");
  const stopped = await api<Session>(`${sessionPath}/stop`, { method: "POST" });
  assert(stopped.status === "stopped", "The mock test did not stop.");
  const report = await api<{ rawMetricCount: number; summary: { durationMs: number } }>(`${sessionPath}/report`);
  assert(report.rawMetricCount > 0, "The stopped mock session has an empty report.");
  assert(report.summary.durationMs >= 0, "The stopped mock report has an invalid duration.");
  metricCount = report.rawMetricCount;
  passed("Mock test stops and produces a stored report");

  for (const format of ["html", "csv", "json"] as const) {
    const response = await request(`${sessionPath}/export?format=${format}`);
    assert(response.ok, `${format.toUpperCase()} report export failed.`);
    const text = await response.text();
    assert(!text.includes(token), "A report export exposed its authentication token.");
    if (format === "html") assert(/<!doctype html>/iu.test(text), "HTML report is missing its document structure.");
    if (format === "csv") assert(text.includes("timestampMs") && text.includes("source") && text.includes("mock"), "CSV report is missing metric columns or mock source labels.");
    if (format === "json") assertMockMetrics((JSON.parse(text) as ReportDocument).metrics);
    outputs.push(format);
    passed(`${format.toUpperCase()} report export`);
  }
  const reportFiles = regularFiles(reportsDir);
  const savedJson = reportFiles.find((file) => basename(file) === "report.json");
  assert(savedJson !== undefined, "The report JSON file was not automatically saved to the test directory.");
  const savedReport = JSON.parse(readFileSync(savedJson, "utf8")) as ReportDocument;
  assertMockMetrics(savedReport.metrics);
  for (const format of ["html", "csv", "json"]) {
    const file = reportFiles.find((candidate) => basename(candidate) === `report.${format}`);
    assert(file !== undefined && statSync(file).size > 0, "The per-test report directory is missing an expected report file.");
    contained(reportsDir, realpathSync(file));
  }
  assert(existsSync(dbPath), "The isolated test database was not created.");
  passed("HTML, CSV, and JSON report files are present in the isolated test directory");
} catch (error) {
  resultError = safeMessage(error);
} finally {
  if (baseUrl !== undefined && alive()) {
    try {
      const shuttingDown = await api<{ shuttingDown: boolean }>("/api/packaged/shutdown", { method: "POST" });
      normalShutdown = shuttingDown.shuttingDown === true && await waitFor(() => !alive(), 15_000) && child.exitCode === 0;
    } catch {
      normalShutdown = false;
    }
  }
  if (alive() && child.pid !== undefined) {
    // Only the process tree created by this smoke is targeted; no package or data files are deleted.
    spawnSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32/taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 10_000 });
    await waitFor(() => !alive(), 5_000);
  }
  if (!normalShutdown && resultError === undefined) resultError = "The isolated packaged sidecar did not shut down normally.";
  if (normalShutdown) passed("The isolated packaged sidecar shuts down normally");
  if ((stdout.includes(token) || stderr.includes(token) || capturedOutputBytes > 1_048_576) && resultError === undefined) resultError = "Packaged process output exceeded the smoke limit or exposed its authentication token.";
  const evidence = {
    schemaVersion: 1,
    status: resultError === undefined ? "passed" : "failed",
    testedAt: new Date().toISOString(),
    packageVersion: portableManifest.version,
    desktopSha256: sha256(desktopPath),
    sidecarSha256: sidecarManifest.sha256,
    systemPathEmpty: true,
    dataSource: "mock",
    rawMetricCount: metricCount,
    exportFormats: outputs,
    normalShutdown,
    packageWritesRequested: false,
    temporaryDataRetained: true,
    checks,
    ...(resultError === undefined ? {} : { failure: resultError })
  };
  writeFileSync(contained(smokeRoot, join(smokeRoot, "smoke-evidence.json")), `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Smoke evidence retained at ${join(smokeRoot, "smoke-evidence.json")}`);
}
if (resultError !== undefined) {
  console.error(resultError);
  process.exitCode = 1;
} else {
  console.log("Portable Windows mock-session and report smoke passed.");
}
