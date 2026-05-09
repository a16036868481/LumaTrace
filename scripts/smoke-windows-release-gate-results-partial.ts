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
  gate?: string;
  blockerCode?: string;
  resultFile?: string;
  status?: string;
  canRemoveBlocker?: boolean;
  sha256?: string;
  sizeBytes?: number;
  verifierExitCode?: number | null;
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
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|reviewerNote|evidenceNote)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function writeManualGuiQaResult(): void {
  if (!existsSync(templatePath)) {
    runNodeScript("scripts/export-windows-manual-gui-qa-template.ts");
  }

  const template = readJson<ManualGuiQaTemplate>(templatePath);
  writeJson(manualResultPath, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-manual-gui-qa-result",
    status: "passed",
    productionReady: false,
    unsignedDraft: true,
    sourceChecklist: template.sourceChecklist,
    reviewer: {
      name: "Partial Intake Fixture QA Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      environment: "Synthetic release gate results partial smoke environment"
    },
    steps: template.steps.map((step) => ({
      id: step.id,
      section: step.section,
      text: step.text,
      status: "passed",
      evidenceNote: `Synthetic release gate result intake fixture evidence for ${step.id}.`,
      reviewerNote: "Verifier smoke fixture; not a real manual GUI QA pass."
    })),
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify partial release gate results intake.",
      "This file is removed after the smoke and is not real manual QA evidence.",
      "productionReady remains false."
    ]
  });
}

function assertPartialIntake(): void {
  const text = readFileSync(intakePath, "utf8");
  const intake = JSON.parse(text) as ReleaseGateResultsIntake;
  const results = intake.results ?? [];
  const resultByBlocker = new Map(results.map((entry) => [entry.blockerCode, entry]));
  const manual = resultByBlocker.get("MANUAL_GUI_QA");
  const missing = results.filter((entry) => entry.status === "missing_result");
  const valid = results.filter((entry) => entry.status === "valid_result");
  const invalid = results.filter((entry) => entry.status === "invalid_result");

  if (!hasCleanText(text)) {
    fail("Partial release gate results intake must remain sanitized.");
  }
  if (intake.evidenceKind !== "windows-release-gate-results-intake") {
    fail("Expected release gate results intake evidence kind.");
  }
  if (intake.status !== "partial_results") {
    fail(`Expected partial_results, got ${String(intake.status)}`);
  }
  if (intake.rcCandidateReady !== false || intake.productionReady !== false) {
    fail("Partial release gate results intake must not mark RC or production ready.");
  }
  if (results.length !== resultFiles.length) {
    fail(`Expected ${String(resultFiles.length)} result entries, got ${String(results.length)}`);
  }
  if (manual?.status !== "valid_result" || manual.canRemoveBlocker !== true) {
    fail("Expected only the manual GUI QA result to be valid and removable.");
  }
  if (typeof manual.sha256 !== "string" || typeof manual.sizeBytes !== "number") {
    fail("Valid manual GUI QA result must include hash and size.");
  }
  if (valid.length !== 1 || invalid.length !== 0 || missing.length !== resultFiles.length - 1) {
    fail("Expected exactly one valid result, zero invalid results, and the remaining gates missing.");
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
    fail("Partial release gate results intake must preserve security assertions.");
  }
}

try {
  for (const path of resultPaths) {
    rmSync(path, { force: true });
  }

  writeManualGuiQaResult();
  runNodeScript("scripts/verify-windows-manual-gui-qa-result.ts", [manualResultPath]);
  runNodeScript("scripts/export-windows-release-gate-results.ts");
  assertPartialIntake();
  runNodeScript("scripts/verify-windows-release-gate-results.ts");
  console.log("Windows release gate results partial smoke passed");
} finally {
  for (const [path, previous] of previousFiles.entries()) {
    if (previous === undefined) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, previous, "utf8");
    }
  }
}
