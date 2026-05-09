import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface GateResultEntry {
  blockerCode?: string;
  status?: string;
  canRemoveBlocker?: boolean;
}

interface ReleaseGateResultsIntake {
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  results?: GateResultEntry[];
}

interface SuiteCaseSummary {
  name: "no_results" | "partial_results" | "invalid_results" | "all_results_valid";
  status: "passed";
  expectedIntakeStatus: string;
}

interface SuiteSmokeManifest {
  schemaVersion: 1;
  generatedAt: string;
  status: "success";
  suiteKind: "windows-release-gate-results-suite";
  productionReady: false;
  rcCandidateReady: false;
  unsigned: true;
  cases: SuiteCaseSummary[];
  restoredPreviousFiles: true;
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawVerifierOutputExcluded: true;
    rawLogsExcluded: true;
    reviewerNotesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const intakePath = resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json");
const suiteManifestPath = resolve(
  releaseDir,
  "lumatrace-windows-release-gate-results-suite-smoke-manifest.json"
);
const resultFiles = [
  "lumatrace-windows-manual-gui-qa-result.json",
  "lumatrace-windows-sidecar-production-readiness-result.json",
  "lumatrace-windows-license-review-result.json",
  "lumatrace-windows-code-signing-readiness-result.json",
  "lumatrace-windows-updater-policy-readiness-result.json",
  "lumatrace-windows-release-approval-readiness-result.json"
] as const;
const resultPaths = resultFiles.map((fileName) => resolve(releaseDir, fileName));
const restorePaths = [intakePath, ...resultPaths] as const;
const previousFiles = new Map<string, string | undefined>(
  restorePaths.map((path) => [path, existsSync(path) ? readFileSync(path, "utf8") : undefined])
);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runPnpmScript(scriptName: string): void {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", `pnpm ${scriptName}`] : [scriptName];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error !== undefined) {
    fail(`${scriptName} failed to start: ${result.error.message}`);
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout.trim().length > 0) {
    console.log(stdout.trim());
  }
  if (stderr.trim().length > 0) {
    console.error(stderr.trim());
  }
  if (result.status !== 0) {
    fail(`${scriptName} failed with exit code ${String(result.status)}`);
  }
}

function runNodeScript(scriptPath: string): void {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim().length > 0) {
    console.error(result.stderr.trim());
  }
  if (result.status !== 0) {
    fail(`${scriptPath} failed with exit code ${String(result.status)}`);
  }
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|reviewerNote|evidenceNote)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function assertNoResultsIntake(): void {
  const text = readFileSync(intakePath, "utf8");
  const intake = JSON.parse(text) as ReleaseGateResultsIntake;
  const results = intake.results ?? [];
  const valid = results.filter((entry) => entry.status === "valid_result");
  const invalid = results.filter((entry) => entry.status === "invalid_result");
  const missing = results.filter((entry) => entry.status === "missing_result");

  if (!hasCleanText(text)) {
    fail("No-results release gate intake must remain sanitized.");
  }
  if (intake.evidenceKind !== "windows-release-gate-results-intake") {
    fail("Expected release gate results intake evidence kind.");
  }
  if (intake.status !== "no_results") {
    fail(`Expected no_results, got ${String(intake.status)}`);
  }
  if (intake.rcCandidateReady !== false || intake.productionReady !== false) {
    fail("No-results release gate intake must not mark RC or production ready.");
  }
  if (results.length !== resultFiles.length || valid.length !== 0 || invalid.length !== 0) {
    fail("Expected six no-results entries with no valid or invalid results.");
  }
  if (missing.length !== resultFiles.length) {
    fail("Expected every release gate result to be missing.");
  }
  for (const entry of missing) {
    if (entry.canRemoveBlocker !== false) {
      fail(`Missing result cannot remove blocker: ${String(entry.blockerCode)}`);
    }
  }
}

function assertRestored(): void {
  for (const [path, previous] of previousFiles.entries()) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    if (current !== previous) {
      fail(`Smoke suite did not restore ${path}`);
    }
  }
}

function restorePreviousFiles(): void {
  for (const [path, previous] of previousFiles.entries()) {
    if (previous === undefined) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, previous, "utf8");
    }
  }
}

function writeSuiteManifest(): void {
  const manifest: SuiteSmokeManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
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
    limitations: [
      "This smoke uses synthetic result files only.",
      "It verifies release gate results intake transitions and sanitization.",
      "It does not approve a release, sign artifacts, enable an updater, or change productionReady."
    ]
  };
  writeFileSync(suiteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const text = readFileSync(suiteManifestPath, "utf8");
  if (!hasCleanText(text)) {
    fail("Release gate results suite manifest must remain sanitized.");
  }
}

try {
  for (const path of resultPaths) {
    rmSync(path, { force: true });
  }
  runNodeScript("scripts/export-windows-release-gate-results.ts");
  assertNoResultsIntake();
  runNodeScript("scripts/verify-windows-release-gate-results.ts");

  runPnpmScript("smoke:windows-release-gate-results-partial");
  runPnpmScript("smoke:windows-release-gate-results-invalid");
  runPnpmScript("smoke:windows-packaging-rc-gate-full-results");

  restorePreviousFiles();
  assertRestored();
  writeSuiteManifest();
  console.log("Windows release gate results suite smoke passed");
} finally {
  restorePreviousFiles();
}
