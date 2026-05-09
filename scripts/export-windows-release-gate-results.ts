import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface GateResultSpec {
  gate: string;
  blockerCode: string;
  resultFile: string;
  templateFile: string;
  verifierScript: string;
  verifierCommand: string;
  rcGateSmokeCommand: string;
}

interface GateResultIntakeEntry {
  gate: string;
  blockerCode: string;
  resultFile: string;
  templateFile: string;
  status: "missing_result" | "valid_result" | "invalid_result";
  canRemoveBlocker: boolean;
  verifierCommand: string;
  rcGateSmokeCommand: string;
  sha256?: string;
  sizeBytes?: number;
  verifierExitCode?: number | null;
  reason: string;
}

interface WindowsReleaseGateResultsIntake {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-release-gate-results-intake";
  status: "no_results" | "partial_results" | "all_results_valid" | "invalid_results";
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  currentRcBlockers: string[];
  results: GateResultIntakeEntry[];
  nextCommands: string[];
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
const outputPath = resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json");

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

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function readRcBlockers(): string[] {
  const rcGatePath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");
  if (!existsSync(rcGatePath)) {
    return [];
  }
  const rcGate = readJson(rcGatePath);
  const blockers = rcGate.blockers;
  if (!Array.isArray(blockers)) {
    return [];
  }
  return blockers
    .map((blocker) => {
      if (blocker === null || Array.isArray(blocker) || typeof blocker !== "object") {
        return undefined;
      }
      return typeof blocker.code === "string" ? blocker.code : undefined;
    })
    .filter((code): code is string => code !== undefined);
}

function runVerifier(spec: GateResultSpec, resultPath: string): number | null {
  const completed = spawnSync(process.execPath, ["--experimental-strip-types", spec.verifierScript, resultPath], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  return completed.status;
}

function buildEntry(spec: GateResultSpec): GateResultIntakeEntry {
  const resultPath = resolve(releaseDir, spec.resultFile);
  if (!existsSync(resultPath)) {
    return {
      gate: spec.gate,
      blockerCode: spec.blockerCode,
      resultFile: spec.resultFile,
      templateFile: spec.templateFile,
      status: "missing_result",
      canRemoveBlocker: false,
      verifierCommand: spec.verifierCommand,
      rcGateSmokeCommand: spec.rcGateSmokeCommand,
      reason: "No result file is present in the release directory."
    };
  }

  const verifierExitCode = runVerifier(spec, resultPath);
  const valid = verifierExitCode === 0;
  return {
    gate: spec.gate,
    blockerCode: spec.blockerCode,
    resultFile: spec.resultFile,
    templateFile: spec.templateFile,
    status: valid ? "valid_result" : "invalid_result",
    canRemoveBlocker: valid,
    verifierCommand: spec.verifierCommand,
    rcGateSmokeCommand: spec.rcGateSmokeCommand,
    sha256: sha256(resultPath),
    sizeBytes: statSync(resultPath).size,
    verifierExitCode,
    reason: valid
      ? "Result file passed its dedicated verifier."
      : "Result file exists but failed its dedicated verifier."
  };
}

const results = gateSpecs.map(buildEntry);
const validCount = results.filter((entry) => entry.status === "valid_result").length;
const invalidCount = results.filter((entry) => entry.status === "invalid_result").length;
const status: WindowsReleaseGateResultsIntake["status"] =
  invalidCount > 0
    ? "invalid_results"
    : validCount === 0
      ? "no_results"
      : validCount === results.length
        ? "all_results_valid"
        : "partial_results";

const manifest: WindowsReleaseGateResultsIntake = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-release-gate-results-intake",
  status,
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  currentRcBlockers: readRcBlockers(),
  results,
  nextCommands: [
    "Place real result files in apps/desktop/src-tauri/target/release or pass explicit paths to their dedicated verifiers.",
    "Run pnpm verify:windows-release-gate-results to validate the current result intake.",
    "Run pnpm verify:windows-packaging-rc-gate after valid real results are present."
  ],
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawVerifierOutputExcluded: true,
    rawLogsExcluded: true,
    reviewerNotesExcluded: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This manifest is an intake summary only, not release approval.",
    "Verifier stdout and stderr are intentionally excluded.",
    "Valid result files can remove only their corresponding blocker after the RC gate is refreshed.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Windows release gate results intake written to ${outputPath}`);
console.log(`status=${manifest.status}`);
console.log(`validResults=${String(validCount)}`);
console.log(`invalidResults=${String(invalidCount)}`);
