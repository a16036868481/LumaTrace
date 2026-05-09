import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

interface SidecarManifest {
  artifactKind: "dev-wrapper" | "self-contained";
  fileName: string;
  nodeRequired: boolean;
  productionReady: boolean;
  runtimeDirectory?: string;
  bundledNodeVersion?: string;
  noticesFile?: string;
  thirdPartyNoticesFile?: string;
  licenseReviewStatus?: string;
}

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function fail(message: string): never {
  throw new Error(`smoke:tauri-release-sidecar failed: ${message}`);
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const releaseSidecarPath = resolve(releaseDir, process.platform === "win32" ? "lumatrace-local-server.exe" : "lumatrace-local-server");
const releaseResourcesDir = resolve(releaseDir, "binaries");
const releaseManifestPath = resolve(releaseResourcesDir, "sidecar-manifest.json");

check("release desktop executable exists", existsSync(resolve(releaseDir, process.platform === "win32" ? "lumatrace-desktop.exe" : "lumatrace-desktop")));
check("release externalBin sidecar exists", existsSync(releaseSidecarPath));
check("release sidecar manifest exists", existsSync(releaseManifestPath));

if (process.exitCode === 1) {
  fail("release artifact preflight failed; run pnpm build:tauri first");
}

const manifest = JSON.parse(readFileSync(releaseManifestPath, "utf8")) as SidecarManifest;
const runtimeDirectory = manifest.runtimeDirectory ?? "lumatrace-local-server-runtime";
const runtimeDir = resolve(releaseResourcesDir, runtimeDirectory);
const runtimeNodePath = resolve(runtimeDir, process.platform === "win32" ? "node.exe" : "node");
const runtimeEntryPath = resolve(runtimeDir, "app/dist/src/index.js");
const noticesPath =
  manifest.noticesFile === undefined ? undefined : resolve(releaseResourcesDir, manifest.noticesFile);
const thirdPartyNoticesPath =
  manifest.thirdPartyNoticesFile === undefined ? undefined : resolve(releaseResourcesDir, manifest.thirdPartyNoticesFile);

check("release manifest is self-contained", manifest.artifactKind === "self-contained");
check("release manifest does not require system Node", manifest.nodeRequired === false);
check("release manifest keeps productionReady=false", manifest.productionReady === false);
check("release manifest keeps license review draft", manifest.licenseReviewStatus === "draft_requires_review");
check("release runtime directory exists", existsSync(runtimeDir));
check("release runtime includes bundled node", existsSync(runtimeNodePath));
check("release runtime includes local-server entry", existsSync(runtimeEntryPath));
check("release packaging notices are bundled", noticesPath !== undefined && existsSync(noticesPath));
check("release third-party notices are bundled", thirdPartyNoticesPath !== undefined && existsSync(thirdPartyNoticesPath));
check("release sidecar base name matches Tauri externalBin", basename(releaseSidecarPath).startsWith("lumatrace-local-server"));

if (process.exitCode === 1) {
  fail("release self-contained sidecar preflight failed");
}

const tempDir = mkdtempSync(join(tmpdir(), "lumatrace-tauri-release-sidecar-"));
const token = "release-sidecar-smoke-token";
const child = spawn(
  releaseSidecarPath,
  [
    "--packaged",
    "--host",
    "127.0.0.1",
    "--port",
    "0",
    "--db-path",
    join(tempDir, "lumatrace.db"),
    "--reports-dir",
    join(tempDir, "reports"),
    "--diagnostics-dir",
    join(tempDir, "diagnostics"),
    "--logs-dir",
    join(tempDir, "logs"),
    "--sidecar-manifest",
    releaseManifestPath,
    "--auth-token",
    token
  ],
  {
    env: {
      SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
      TEMP: process.env.TEMP ?? tempDir,
      TMP: process.env.TMP ?? tempDir,
      PATH: "",
      LUMATRACE_SIDECAR_RUNTIME_DIR: runtimeDir
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  }
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk: Buffer) => {
  stdout += chunk.toString("utf8");
});
child.stderr.on("data", (chunk: Buffer) => {
  stderr += chunk.toString("utf8");
});

try {
  let ready: { host: string; port: number } | undefined;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const line = stdout.split(/\r?\n/).find((entry) => entry.includes("lumatrace.local-server.ready"));
    if (line !== undefined) {
      ready = JSON.parse(line) as { host: string; port: number };
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  check("release sidecar emits ready JSON", ready !== undefined);
  if (ready === undefined) {
    fail(stderr.split(/\r?\n/).slice(0, 8).join("\n"));
  }

  const statusResponse = await fetch(`http://${ready.host}:${ready.port}/api/packaged/status`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  check("release sidecar status accepts valid auth", statusResponse.ok);
  const statusText = await statusResponse.text();
  check("release status reports self-contained", statusText.includes('"artifactKind":"self-contained"'));
  check("release status keeps productionReady false", statusText.includes('"productionReady":false'));
  check("release status does not leak token", !statusText.includes(token));

  const invalidResponse = await fetch(`http://${ready.host}:${ready.port}/api/packaged/status`, {
    headers: {
      Authorization: "Bearer invalid-token"
    }
  });
  check("release sidecar rejects invalid auth", invalidResponse.status === 401);

  await fetch(`http://${ready.host}:${ready.port}/api/packaged/shutdown`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  }).catch(() => undefined);

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  check("release stdout does not leak token", !stdout.includes(token));
  check("release stderr does not leak token", !stderr.includes(token));
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
  }
  rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

if (process.exitCode === 1) {
  fail("one or more checks failed");
}

console.log("Tauri release sidecar smoke passed");
