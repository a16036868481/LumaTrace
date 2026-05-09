import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

interface GateResultEntry {
  blockerCode?: string;
  resultFile?: string;
  status?: string;
  canRemoveBlocker?: boolean;
  sha256?: string;
  sizeBytes?: number;
  verifierExitCode?: number | null;
  reason?: string;
}

interface ReleaseGateResultsIntake {
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  results?: GateResultEntry[];
  securityAssertions?: {
    tokenRedacted?: boolean;
    fullLocalPathsRedacted?: boolean;
    rawVerifierOutputExcluded?: boolean;
    rawLogsExcluded?: boolean;
    reviewerNotesExcluded?: boolean;
    publicSidecarListenersAllowed?: boolean;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const templatePath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json");
const intakePath = resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json");
const resultFiles = [
  "lumatrace-windows-manual-gui-qa-result.json",
  "lumatrace-windows-sidecar-production-readiness-result.json",
  "lumatrace-windows-license-review-result.json",
  "lumatrace-windows-code-signing-readiness-result.json",
  "lumatrace-windows-updater-policy-readiness-result.json",
  "lumatrace-windows-release-approval-readiness-result.json"
] as const;
const resultPaths = resultFiles.map((fileName) => resolve(releaseDir, fileName));
const manualResultPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json");
const restorePaths = [templatePath, intakePath, ...resultPaths] as const;
const previousFiles = new Map<string, string | undefined>(
  restorePaths.map((path) => [path, existsSync(path) ? readFileSync(path, "utf8") : undefined])
);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runNodeScript(scriptPath: string, args: string[] = [], options: { expectFailure?: boolean } = {}): void {
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

  if (options.expectFailure === true) {
    if (result.status === 0) {
      fail(`${scriptPath} unexpectedly succeeded`);
    }
    return;
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
    !/LUMATRACE_AUTH_TOKEN\s*=\s*[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|reviewerNote|evidenceNote)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function writeInvalidManualGuiQaResult(): void {
  if (!existsSync(templatePath)) {
    runNodeScript("scripts/export-windows-manual-gui-qa-template.ts");
  }

  const template = readJson<ManualGuiQaTemplate>(templatePath);
  writeJson(manualResultPath, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-manual-gui-qa-result",
    status: "passed",
    productionReady: true,
    unsignedDraft: true,
    sourceChecklist: template.sourceChecklist,
    reviewer: {
      name: "Invalid Intake Fixture QA Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      environment:
        "Synthetic invalid fixture with Bearer invalid-fixture-token and C:\\Users\\Sensitive\\Desktop\\artifact.log"
    },
    steps: template.steps.map((step, index) => ({
      id: step.id,
      section: step.section,
      text: step.text,
      status: index === 0 ? "pending" : "passed",
      evidenceNote:
        "Invalid fixture note with lumatrace-auth.invalid-fixture-token and /Users/sensitive/build/output.log",
      reviewerNote: "Invalid fixture note that must not be copied into the intake."
    })),
    rawLogs: "Error: invalid fixture\n    at C:\\Users\\Sensitive\\project\\app.ts:1:1",
    securityAssertions: {
      ...template.securityAssertions,
      tokenRedactionRequired: false
    },
    limitations: [
      "Synthetic invalid fixture used only to verify invalid release gate results intake.",
      "This file is removed after the smoke and is not real manual QA evidence."
    ]
  });
}

function assertInvalidIntake(): void {
  const text = readFileSync(intakePath, "utf8");
  const intake = JSON.parse(text) as ReleaseGateResultsIntake;
  const results = intake.results ?? [];
  const resultByBlocker = new Map(results.map((entry) => [entry.blockerCode, entry]));
  const manual = resultByBlocker.get("MANUAL_GUI_QA");
  const missing = results.filter((entry) => entry.status === "missing_result");
  const valid = results.filter((entry) => entry.status === "valid_result");
  const invalid = results.filter((entry) => entry.status === "invalid_result");

  if (!hasCleanText(text)) {
    fail("Invalid release gate results intake must remain sanitized.");
  }
  if (intake.evidenceKind !== "windows-release-gate-results-intake") {
    fail("Expected release gate results intake evidence kind.");
  }
  if (intake.status !== "invalid_results") {
    fail(`Expected invalid_results, got ${String(intake.status)}`);
  }
  if (intake.rcCandidateReady !== false || intake.productionReady !== false) {
    fail("Invalid release gate results intake must not mark RC or production ready.");
  }
  if (results.length !== resultFiles.length) {
    fail(`Expected ${String(resultFiles.length)} result entries, got ${String(results.length)}`);
  }
  if (manual?.status !== "invalid_result" || manual.canRemoveBlocker !== false) {
    fail("Expected the manual GUI QA result to be invalid and non-removable.");
  }
  if (manual.resultFile !== "lumatrace-windows-manual-gui-qa-result.json") {
    fail("Invalid manual result must keep only a stable file name.");
  }
  if (typeof manual.sha256 !== "string" || typeof manual.sizeBytes !== "number") {
    fail("Invalid manual GUI QA result must include hash and size without copying content.");
  }
  if (typeof manual.verifierExitCode !== "number" || manual.verifierExitCode === 0) {
    fail("Invalid manual GUI QA result must record a non-zero verifier exit code.");
  }
  if (manual.reason !== "Result file exists but failed its dedicated verifier.") {
    fail("Invalid manual GUI QA result must record a stable failure reason.");
  }
  if (valid.length !== 0 || invalid.length !== 1 || missing.length !== resultFiles.length - 1) {
    fail("Expected zero valid results, one invalid result, and the remaining gates missing.");
  }
  for (const entry of missing) {
    if (entry.canRemoveBlocker !== false) {
      fail(`Missing result cannot remove blocker: ${String(entry.blockerCode)}`);
    }
  }
  if (
    intake.securityAssertions?.tokenRedacted !== true ||
    intake.securityAssertions.fullLocalPathsRedacted !== true ||
    intake.securityAssertions.rawVerifierOutputExcluded !== true ||
    intake.securityAssertions.rawLogsExcluded !== true ||
    intake.securityAssertions.reviewerNotesExcluded !== true ||
    intake.securityAssertions.publicSidecarListenersAllowed !== false
  ) {
    fail("Invalid release gate results intake must preserve security assertions.");
  }
}

try {
  for (const path of resultPaths) {
    rmSync(path, { force: true });
  }

  writeInvalidManualGuiQaResult();
  runNodeScript("scripts/verify-windows-manual-gui-qa-result.ts", [manualResultPath], { expectFailure: true });
  runNodeScript("scripts/export-windows-release-gate-results.ts");
  assertInvalidIntake();
  runNodeScript("scripts/verify-windows-release-gate-results.ts");
  console.log("Windows release gate results invalid smoke passed");
} finally {
  for (const [path, previous] of previousFiles.entries()) {
    if (previous === undefined) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, previous, "utf8");
    }
  }
}
