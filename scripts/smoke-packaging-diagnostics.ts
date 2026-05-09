import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../apps/local-server/dist/src/server.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function writeManifest(root: string): string {
  mkdirSync(root, { recursive: true });
  const fileName = "lumatrace-local-server-x86_64-pc-windows-msvc.cmd";
  const artifact = "@echo off\r\nnode dist/src/index.js\r\n";
  writeFileSync(join(root, fileName), artifact, "utf8");
  const manifest = {
    name: "lumatrace-local-server",
    version: "0.0.0",
    artifactKind: "dev-wrapper",
    platform: "win32",
    arch: "x64",
    targetTriple: "x86_64-pc-windows-msvc",
    fileName,
    sizeBytes: Buffer.byteLength(artifact),
    sha256: createHash("sha256").update(artifact).digest("hex"),
    buildTime: new Date(0).toISOString(),
    sourcePackageVersion: "0.0.0",
    nodeRequired: true,
    productionReady: false,
    limitations: ["dev-wrapper smoke artifact"]
  };
  const manifestPath = join(root, "sidecar-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(
    join(root, "lumatrace-windows-release-gate-results-suite-smoke-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        status: "success",
        suiteKind: "windows-release-gate-results-suite",
        productionReady: false,
        rcCandidateReady: false,
        unsigned: true,
        cases: [
          { name: "no_results", status: "passed", expectedIntakeStatus: "no_results" },
          { name: "partial_results", status: "passed", expectedIntakeStatus: "partial_results" },
          { name: "invalid_results", status: "passed", expectedIntakeStatus: "invalid_results" },
          { name: "all_results_valid", status: "passed", expectedIntakeStatus: "all_results_valid" }
        ],
        restoredPreviousFiles: true,
        securityAssertions: {
          tokenRedacted: true,
          fullLocalPathsRedacted: true,
          rawVerifierOutputExcluded: true,
          rawLogsExcluded: true,
          reviewerNotesExcluded: true,
          publicSidecarListenersAllowed: false
        },
        limitations: ["Synthetic smoke evidence only."]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return manifestPath;
}

const root = mkdtempSync(join(tmpdir(), "lumatrace-packaging-diagnostics-"));
const token = "packaging-diagnostics-token-123456789";
const dbPath = join(root, "AppLocalData", "lumatrace.db");
const reportsDir = join(root, "AppLocalData", "reports");
const diagnosticsDir = join(root, "AppLocalData", "diagnostics");
const logsDir = join(root, "AppLog");
const manifestPath = writeManifest(join(root, "binaries"));

mkdirSync(logsDir, { recursive: true });
mkdirSync(join(root, "AppLocalData"), { recursive: true });
mkdirSync(reportsDir, { recursive: true });
mkdirSync(diagnosticsDir, { recursive: true });
writeFileSync(
  join(logsDir, "local-server.log"),
  [
    `Authorization: Bearer ${token}`,
    `protocol=lumatrace-auth.${token}`,
    "email=user@example.com",
    "path=C:\\Users\\Alice\\AppData\\Local\\LumaTrace\\lumatrace.db",
    "csv=/Users/alice/PresentMon/capture.csv",
    "Error: stack leak",
    "    at run (C:\\Users\\Alice\\repo\\file.ts:10:1)",
    `stdout=${"x".repeat(6000)}`
  ].join("\n"),
  "utf8"
);

const app = await createServer({
  packaged: true,
  host: "127.0.0.1",
  port: 0,
  dbPath,
  reportsDir,
  diagnosticsDir,
  logsDir,
  sidecarManifestPath: manifestPath,
  authToken: token,
  enableLogger: false
});

try {
  const status = await app.inject({
    method: "GET",
    url: "/api/packaged/status",
    headers: { authorization: `Bearer ${token}` }
  });
  assert(status.statusCode === 200, `status failed: ${status.statusCode}`);
  assert(!status.body.includes(token), "status leaked auth token");
  assert(!status.body.includes(root), "status leaked raw temp path");
  assert(status.body.includes("releaseGateResultsSuite"), "status missing release gate results suite");

  const invalidExport = await app.inject({
    method: "GET",
    url: "/api/packaged/diagnostics/export?format=json",
    headers: { authorization: "Bearer invalid-token" }
  });
  assert(invalidExport.statusCode === 401, "invalid auth should not export diagnostics");

  const exportResponse = await app.inject({
    method: "GET",
    url: "/api/packaged/diagnostics/export?format=json",
    headers: { authorization: `Bearer ${token}` }
  });
  assert(exportResponse.statusCode === 200, `export failed: ${exportResponse.statusCode}`);
  const body = exportResponse.body;
  assert(!body.includes(token), "diagnostics export leaked auth token");
  assert(!body.includes(root), "diagnostics export leaked full temp path");
  assert(!body.includes("user@example.com"), "diagnostics export leaked email");
  assert(!body.includes("file.ts:10"), "diagnostics export leaked raw stack frame");
  assert(!body.includes("/Users/alice/PresentMon/capture.csv"), "diagnostics export leaked raw CSV path");
  assert(body.includes("sidecarManifest"), "diagnostics export missing sidecar manifest");
  assert(body.includes("toolchainStatus"), "diagnostics export missing toolchain status");
  assert(body.includes("releaseGateResultsSuite"), "diagnostics export missing release gate results suite");
  assert(body.includes("windows-release-gate-results-suite"), "diagnostics export missing release gate suite kind");
  assert(body.includes("logFiles"), "diagnostics export missing log metadata");
  assert(body.includes("rotationPolicy"), "diagnostics export missing rotation policy");

  const shutdown = await app.inject({
    method: "POST",
    url: "/api/packaged/shutdown",
    headers: { authorization: `Bearer ${token}` }
  });
  assert(shutdown.statusCode === 200, "shutdown failed");
} finally {
  await app.close().catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
}

console.log("Packaging diagnostics smoke passed");
