import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

interface GateResultSpec {
  gate: string;
  blockerCode: string;
  resultFile: string;
  templateFile: string;
  verifierScript: string;
  verifierCommand: string;
  rcGateSmokeCommand: string;
}

interface ImportEntry {
  gate: string;
  blockerCode: string;
  resultFile: string;
  templateFile: string;
  sourceFile: string;
  status: "missing_source" | "valid_imported" | "valid_dry_run" | "invalid_rejected";
  copied: boolean;
  verifierCommand: string;
  rcGateSmokeCommand: string;
  sha256?: string;
  sizeBytes?: number;
  verifierExitCode?: number | null;
  reason: string;
}

interface WindowsReleaseGateResultsImportManifest {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-release-gate-results-import";
  status: "no_results_found" | "valid_results_imported" | "invalid_results_rejected" | "mixed_results" | "dry_run";
  sourceDirectoryKind: "workspace_results" | "custom_results_dir";
  dryRun: boolean;
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  importSummary: {
    total: number;
    valid: number;
    invalid: number;
    missing: number;
    copied: number;
  };
  results: ImportEntry[];
  ignoredFiles: string[];
  refreshedIntake?: {
    fileName: "lumatrace-windows-release-gate-results-intake.json";
    status: string;
    validResults: number;
    invalidResults: number;
    missingResults: number;
  };
  nextCommands: string[];
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawVerifierOutputExcluded: true;
    rawLogsExcluded: true;
    reviewerNotesExcluded: true;
    sourceDirectoryPathExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const defaultResultsDir = resolve(releaseDir, "lumatrace-windows-release-result-workspace/results");
const outputPath = resolve(releaseDir, "lumatrace-windows-release-gate-results-import-manifest.json");
const intakePath = resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json");

const gateSpecs: GateResultSpec[] = [
  {
    gate: "manual_gui_qa",
    blockerCode: "MANUAL_GUI_QA",
    resultFile: "lumatrace-windows-manual-gui-qa-result.json",
    templateFile: "lumatrace-windows-manual-gui-qa-template.json",
    verifierScript: "scripts/verify-windows-manual-gui-qa-result.ts",
    verifierCommand: "pnpm verify:windows-manual-gui-qa-result path/to/lumatrace-windows-manual-gui-qa-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-manual-result"
  },
  {
    gate: "sidecar_production_readiness",
    blockerCode: "SIDECAR_PRODUCTION_READINESS",
    resultFile: "lumatrace-windows-sidecar-production-readiness-result.json",
    templateFile: "lumatrace-windows-sidecar-production-readiness-template.json",
    verifierScript: "scripts/verify-windows-sidecar-production-readiness-result.ts",
    verifierCommand:
      "pnpm verify:windows-sidecar-production-readiness-result path/to/lumatrace-windows-sidecar-production-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-sidecar-readiness-result"
  },
  {
    gate: "license_notice_review",
    blockerCode: "LICENSE_NOTICE_REVIEW",
    resultFile: "lumatrace-windows-license-review-result.json",
    templateFile: "lumatrace-windows-license-review-template.json",
    verifierScript: "scripts/verify-windows-license-review-result.ts",
    verifierCommand: "pnpm verify:windows-license-review-result path/to/lumatrace-windows-license-review-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-license-review-result"
  },
  {
    gate: "code_signing",
    blockerCode: "CODE_SIGNING",
    resultFile: "lumatrace-windows-code-signing-readiness-result.json",
    templateFile: "lumatrace-windows-code-signing-readiness-template.json",
    verifierScript: "scripts/verify-windows-code-signing-readiness-result.ts",
    verifierCommand:
      "pnpm verify:windows-code-signing-readiness-result path/to/lumatrace-windows-code-signing-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-code-signing-result"
  },
  {
    gate: "updater_policy",
    blockerCode: "UPDATER_POLICY",
    resultFile: "lumatrace-windows-updater-policy-readiness-result.json",
    templateFile: "lumatrace-windows-updater-policy-readiness-template.json",
    verifierScript: "scripts/verify-windows-updater-policy-readiness-result.ts",
    verifierCommand:
      "pnpm verify:windows-updater-policy-readiness-result path/to/lumatrace-windows-updater-policy-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-updater-policy-result"
  },
  {
    gate: "release_approval",
    blockerCode: "RELEASE_APPROVAL",
    resultFile: "lumatrace-windows-release-approval-readiness-result.json",
    templateFile: "lumatrace-windows-release-approval-readiness-template.json",
    verifierScript: "scripts/verify-windows-release-approval-readiness-result.ts",
    verifierCommand:
      "pnpm verify:windows-release-approval-readiness-result path/to/lumatrace-windows-release-approval-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-release-approval-result"
  }
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeFileName(fileName: string): boolean {
  return basename(fileName) === fileName && !/[\\/]/u.test(fileName);
}

function runNodeScript(scriptPath: string, args: string[] = []): number | null {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  return result.status;
}

function runRequiredScript(scriptPath: string): void {
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

function readIntakeSummary(): WindowsReleaseGateResultsImportManifest["refreshedIntake"] | undefined {
  if (!existsSync(intakePath)) {
    return undefined;
  }
  const intake = JSON.parse(readFileSync(intakePath, "utf8")) as {
    status?: unknown;
    results?: Array<{ status?: unknown }>;
  };
  const results = Array.isArray(intake.results) ? intake.results : [];
  return {
    fileName: "lumatrace-windows-release-gate-results-intake.json",
    status: typeof intake.status === "string" ? intake.status : "unknown",
    validResults: results.filter((entry) => entry.status === "valid_result").length,
    invalidResults: results.filter((entry) => entry.status === "invalid_result").length,
    missingResults: results.filter((entry) => entry.status === "missing_result").length
  };
}

const resultsDirArg = argValue("--results-dir");
const dryRun = hasFlag("--dry-run");
const resultsDir =
  resultsDirArg === undefined ? defaultResultsDir : isAbsolute(resultsDirArg) ? resultsDirArg : resolve(root, resultsDirArg);
const sourceDirectoryKind: WindowsReleaseGateResultsImportManifest["sourceDirectoryKind"] =
  resultsDirArg === undefined ? "workspace_results" : "custom_results_dir";

if (!existsSync(resultsDir)) {
  fail("Release gate results import source directory is missing. Pass --results-dir or create the workspace results directory.");
}

const expectedFileNames = new Set(gateSpecs.map((spec) => spec.resultFile));
const ignoredFiles = readdirSync(resultsDir)
  .filter((fileName) => !expectedFileNames.has(fileName))
  .filter(safeFileName)
  .sort();

const entries = gateSpecs.map<ImportEntry>((spec) => {
  const sourcePath = resolve(resultsDir, spec.resultFile);
  if (!existsSync(sourcePath)) {
    return {
      gate: spec.gate,
      blockerCode: spec.blockerCode,
      resultFile: spec.resultFile,
      templateFile: spec.templateFile,
      sourceFile: spec.resultFile,
      status: "missing_source",
      copied: false,
      verifierCommand: spec.verifierCommand,
      rcGateSmokeCommand: spec.rcGateSmokeCommand,
      reason: "No result file with this exact name was found in the import source directory."
    };
  }

  const verifierExitCode = runNodeScript(spec.verifierScript, [sourcePath]);
  const valid = verifierExitCode === 0;
  const hash = sha256(sourcePath);
  const sizeBytes = statSync(sourcePath).size;
  if (valid && !dryRun) {
    copyFileSync(sourcePath, resolve(releaseDir, spec.resultFile));
  }

  return {
    gate: spec.gate,
    blockerCode: spec.blockerCode,
    resultFile: spec.resultFile,
    templateFile: spec.templateFile,
    sourceFile: spec.resultFile,
    status: valid ? (dryRun ? "valid_dry_run" : "valid_imported") : "invalid_rejected",
    copied: valid && !dryRun,
    verifierCommand: spec.verifierCommand,
    rcGateSmokeCommand: spec.rcGateSmokeCommand,
    sha256: hash,
    sizeBytes,
    verifierExitCode,
    reason: valid
      ? dryRun
        ? "Result file passed its dedicated verifier; dry-run did not copy it."
        : "Result file passed its dedicated verifier and was copied to the release directory."
      : "Result file failed its dedicated verifier and was not copied."
  };
});

runRequiredScript("scripts/export-windows-release-gate-results.ts");
runRequiredScript("scripts/verify-windows-release-gate-results.ts");

const validCount = entries.filter((entry) => entry.status === "valid_imported" || entry.status === "valid_dry_run").length;
const invalidCount = entries.filter((entry) => entry.status === "invalid_rejected").length;
const missingCount = entries.filter((entry) => entry.status === "missing_source").length;
const copiedCount = entries.filter((entry) => entry.copied).length;
const status: WindowsReleaseGateResultsImportManifest["status"] = dryRun
  ? "dry_run"
  : validCount > 0 && invalidCount > 0
    ? "mixed_results"
    : validCount > 0
      ? "valid_results_imported"
      : invalidCount > 0
        ? "invalid_results_rejected"
        : "no_results_found";

const manifest: WindowsReleaseGateResultsImportManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-release-gate-results-import",
  status,
  sourceDirectoryKind,
  dryRun,
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  importSummary: {
    total: entries.length,
    valid: validCount,
    invalid: invalidCount,
    missing: missingCount,
    copied: copiedCount
  },
  results: entries,
  ignoredFiles,
  refreshedIntake: readIntakeSummary(),
  nextCommands: [
    "Review lumatrace-windows-release-gate-results-import-manifest.json.",
    "Run pnpm verify:windows-release-gate-results-import.",
    "Run pnpm verify:windows-packaging-rc-gate after imported result files are accepted."
  ],
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawVerifierOutputExcluded: true,
    rawLogsExcluded: true,
    reviewerNotesExcluded: true,
    sourceDirectoryPathExcluded: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This manifest records result import status only, not release approval.",
    "Only exact known result file names are considered.",
    "Invalid result files are not copied to the release directory.",
    "Source directory paths and verifier stdout/stderr are intentionally excluded.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Windows release gate results import manifest written to ${outputPath}`);
console.log(`status=${manifest.status}`);
console.log(`copied=${String(copiedCount)}`);
console.log(`invalid=${String(invalidCount)}`);
