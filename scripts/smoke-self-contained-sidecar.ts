import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface SidecarManifest {
  artifactKind: "dev-wrapper" | "self-contained";
  fileName: string;
  nodeRequired: boolean;
  productionReady: boolean;
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
  throw new Error(`smoke:self-contained-sidecar failed: ${message}`);
}

const root = process.cwd();
const manifestPath = resolve(root, "apps/desktop/src-tauri/binaries/sidecar-manifest.json");
if (!existsSync(manifestPath)) {
  fail("sidecar manifest is missing; run pnpm build:self-contained-sidecar first");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SidecarManifest;
const sidecarPath = resolve(root, "apps/desktop/src-tauri/binaries", manifest.fileName);
const runtimeNodePath = resolve(
  root,
  "apps/desktop/src-tauri/binaries/lumatrace-local-server-runtime",
  process.platform === "win32" ? "node.exe" : "node"
);
const runtimeEntryPath = resolve(
  root,
  "apps/desktop/src-tauri/binaries/lumatrace-local-server-runtime/app/dist/src/index.js"
);
const noticesPath =
  manifest.noticesFile === undefined
    ? undefined
    : resolve(root, "apps/desktop/src-tauri/binaries", manifest.noticesFile);
const thirdPartyNoticesPath =
  manifest.thirdPartyNoticesFile === undefined
    ? undefined
    : resolve(root, "apps/desktop/src-tauri/binaries", manifest.thirdPartyNoticesFile);

check("manifest is self-contained", manifest.artifactKind === "self-contained");
check("manifest does not require system Node", manifest.nodeRequired === false);
check("manifest keeps productionReady=false", manifest.productionReady === false);
check("manifest keeps license review draft", manifest.licenseReviewStatus === "draft_requires_review");
check("sidecar wrapper exists", existsSync(sidecarPath));
check("bundled node runtime exists", existsSync(runtimeNodePath));
check("deployed local-server entry exists", existsSync(runtimeEntryPath));
check("packaging notices exist", noticesPath !== undefined && existsSync(noticesPath));
check("third-party notices exist", thirdPartyNoticesPath !== undefined && existsSync(thirdPartyNoticesPath));

if (process.exitCode === 1) {
  fail("artifact preflight failed");
}

const tempDir = mkdtempSync(join(tmpdir(), "lumatrace-self-contained-smoke-"));
const token = "self-contained-smoke-token";
const child = spawn(
  sidecarPath,
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
    manifestPath,
    "--auth-token",
    token
  ],
  {
    env: {
      SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
      TEMP: process.env.TEMP ?? tempDir,
      TMP: process.env.TMP ?? tempDir,
      PATH: ""
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

  check("self-contained sidecar emits ready JSON", ready !== undefined);
  if (ready === undefined) {
    fail(stderr.split(/\r?\n/).slice(0, 5).join("\n"));
  }

  const statusResponse = await fetch(`http://${ready.host}:${ready.port}/api/packaged/status`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  check("packaged status accepts valid auth", statusResponse.ok);
  const statusText = await statusResponse.text();
  check("packaged status does not leak token", !statusText.includes(token));
  check("packaged status reports self-contained sidecar", statusText.includes('"artifactKind":"self-contained"'));
  check("packaged status keeps productionReady false", statusText.includes('"productionReady":false'));

  const invalidResponse = await fetch(`http://${ready.host}:${ready.port}/api/packaged/status`, {
    headers: {
      Authorization: "Bearer invalid-token"
    }
  });
  check("invalid auth is rejected", invalidResponse.status === 401);

  await fetch(`http://${ready.host}:${ready.port}/api/packaged/shutdown`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  }).catch(() => undefined);

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  check("stdout does not leak token", !stdout.includes(token));
  check("stderr does not leak token", !stderr.includes(token));
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
  }
  rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

if (process.exitCode === 1) {
  fail("one or more checks failed");
}

console.log("Self-contained sidecar smoke passed");
