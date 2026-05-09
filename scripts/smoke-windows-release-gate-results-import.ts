import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface ManualGuiQaStep {
  id: string;
  section: string;
  text: string;
}

interface ManualGuiQaTemplate {
  sourceChecklist: {
    path: "docs/windows-packaging-manual-gui-checklist.md";
    itemCount: number;
  };
  securityAssertions: {
    tokenRedactionRequired: true;
    fullLocalPathRedactionRequired: true;
    rawLogsExcluded: true;
    stackTracesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  steps: ManualGuiQaStep[];
}

interface ImportEntry {
  blockerCode?: string;
  resultFile?: string;
  status?: string;
  copied?: boolean;
  verifierExitCode?: number | null;
}

interface ImportManifest {
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  importSummary?: {
    valid?: number;
    invalid?: number;
    missing?: number;
    copied?: number;
  };
  results?: ImportEntry[];
  refreshedIntake?: {
    status?: string;
    validResults?: number;
    invalidResults?: number;
    missingResults?: number;
  };
}

interface IntakeEntry {
  blockerCode?: string;
  status?: string;
  canRemoveBlocker?: boolean;
}

interface IntakeManifest {
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  results?: IntakeEntry[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const templatePath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json");
const importManifestPath = resolve(releaseDir, "lumatrace-windows-release-gate-results-import-manifest.json");
const intakePath = resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json");
const resultFiles = [
  "lumatrace-windows-manual-gui-qa-result.json",
  "lumatrace-windows-sidecar-production-readiness-result.json",
  "lumatrace-windows-license-review-result.json",
  "lumatrace-windows-code-signing-readiness-result.json",
  "lumatrace-windows-updater-policy-readiness-result.json",
  "lumatrace-windows-release-approval-readiness-result.json"
] as const;
const restorePaths = [
  templatePath,
  importManifestPath,
  intakePath,
  ...resultFiles.map((fileName) => resolve(releaseDir, fileName))
] as const;
const previousFiles = new Map<string, string | undefined>(
  restorePaths.map((path) => [path, existsSync(path) ? readFileSync(path, "utf8") : undefined])
);
const importDir = mkdtempSync(join(tmpdir(), "lumatrace-release-gate-import-"));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runNodeScript(scriptPath: string, args: string[] = []): void {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|reviewerNote|evidenceNote|sourceDirectory)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function writeManualGuiQaResult(): void {
  runNodeScript("scripts/export-windows-manual-gui-qa-template.ts");
  const template = readJson<ManualGuiQaTemplate>(templatePath);
  writeJson(join(importDir, "lumatrace-windows-manual-gui-qa-result.json"), {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-manual-gui-qa-result",
    status: "passed",
    productionReady: false,
    unsignedDraft: true,
    sourceChecklist: template.sourceChecklist,
    reviewer: {
      name: "Import Smoke Fixture QA Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      environment: "Synthetic release gate import smoke environment"
    },
    steps: template.steps.map((step) => ({
      id: step.id,
      section: step.section,
      text: step.text,
      status: "passed",
      evidenceNote: `Synthetic import smoke evidence for ${step.id}.`,
      reviewerNote: "Verifier smoke fixture; not a real manual GUI QA pass."
    })),
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify release gate result import.",
      "This file is removed after the smoke and is not real manual QA evidence.",
      "productionReady remains false."
    ]
  });
}

function writeInvalidLicenseResult(): void {
  writeJson(join(importDir, "lumatrace-windows-license-review-result.json"), {
    schemaVersion: 1,
    evidenceKind: "windows-license-review-result",
    status: "approved",
    approved: true,
    productionReady: true,
    unsignedDraft: true,
    reviewer: {
      name: "Invalid Import Fixture",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    reviewerNote: "Bearer should-not-appear C:\\Users\\Alice\\secret.txt",
    reviewItems: [],
    securityAssertions: {
      tokenRedacted: false,
      fullLocalPathsRedacted: false,
      rawLogsExcluded: true,
      rawLicenseTextExcluded: true,
      stackTracesExcluded: true
    }
  });
  writeFileSync(join(importDir, "unexpected-extra-file.json"), "{\"ignored\":true}\n", "utf8");
}

function assertImportManifest(): void {
  const text = readFileSync(importManifestPath, "utf8");
  const manifest = JSON.parse(text) as ImportManifest;
  const entries = manifest.results ?? [];
  const byBlocker = new Map(entries.map((entry) => [entry.blockerCode, entry]));
  const manual = byBlocker.get("MANUAL_GUI_QA");
  const license = byBlocker.get("LICENSE_NOTICE_REVIEW");

  if (!hasCleanText(text)) {
    fail("Release gate import manifest must remain sanitized.");
  }
  if (manifest.evidenceKind !== "windows-release-gate-results-import") {
    fail("Expected release gate results import evidence kind.");
  }
  if (manifest.status !== "mixed_results") {
    fail(`Expected mixed_results import status, got ${String(manifest.status)}`);
  }
  if (manifest.rcCandidateReady !== false || manifest.productionReady !== false) {
    fail("Import manifest must not mark RC or production ready.");
  }
  if (manifest.importSummary?.valid !== 1 || manifest.importSummary.invalid !== 1 || manifest.importSummary.copied !== 1) {
    fail("Expected one valid imported result, one invalid rejected result, and one copied result.");
  }
  if (manual?.status !== "valid_imported" || manual.copied !== true) {
    fail("Expected manual GUI QA result to be imported.");
  }
  if (license?.status !== "invalid_rejected" || license.copied !== false || typeof license.verifierExitCode !== "number") {
    fail("Expected invalid license review result to be rejected.");
  }
  if (manifest.refreshedIntake?.status !== "partial_results" || manifest.refreshedIntake.validResults !== 1) {
    fail("Expected refreshed intake to be partial after one valid import.");
  }
}

function assertRefreshedIntake(): void {
  const text = readFileSync(intakePath, "utf8");
  const intake = JSON.parse(text) as IntakeManifest;
  const results = intake.results ?? [];
  const manual = results.find((entry) => entry.blockerCode === "MANUAL_GUI_QA");
  const license = results.find((entry) => entry.blockerCode === "LICENSE_NOTICE_REVIEW");
  if (!hasCleanText(text)) {
    fail("Refreshed intake must remain sanitized.");
  }
  if (intake.status !== "partial_results") {
    fail(`Expected partial_results intake after import, got ${String(intake.status)}`);
  }
  if (manual?.status !== "valid_result" || manual.canRemoveBlocker !== true) {
    fail("Expected imported manual GUI QA result to be valid in intake.");
  }
  if (license?.status !== "missing_result" || license.canRemoveBlocker !== false) {
    fail("Rejected license result must not appear as valid or invalid intake.");
  }
}

try {
  for (const fileName of resultFiles) {
    rmSync(resolve(releaseDir, fileName), { force: true });
  }
  rmSync(importManifestPath, { force: true });
  writeManualGuiQaResult();
  writeInvalidLicenseResult();

  runNodeScript("scripts/import-windows-release-gate-results.ts", ["--results-dir", importDir]);
  runNodeScript("scripts/verify-windows-release-gate-results-import.ts");
  assertImportManifest();
  assertRefreshedIntake();
  if (!existsSync(resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json"))) {
    fail("Imported manual GUI QA result was not copied to release directory.");
  }
  if (existsSync(resolve(releaseDir, "lumatrace-windows-license-review-result.json"))) {
    fail("Invalid license review result must not be copied to release directory.");
  }
  console.log("Windows release gate results import smoke passed");
} finally {
  for (const [path, previous] of previousFiles.entries()) {
    if (previous === undefined) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, previous, "utf8");
    }
  }
  rmSync(importDir, { recursive: true, force: true });
}
