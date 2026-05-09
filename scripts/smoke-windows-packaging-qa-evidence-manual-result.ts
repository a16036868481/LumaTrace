import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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

interface PackagingQaEvidence {
  manualGuiQa?: {
    status?: string;
    requiredBeforeRelease?: boolean;
    result?: {
      exists?: boolean;
      validationStatus?: string;
      status?: string;
      passedSteps?: number;
    };
  };
  productionReady?: boolean;
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const templatePath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json");
const resultPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json");
const evidencePath = resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json");
const previousResult = existsSync(resultPath) ? readFileSync(resultPath, "utf8") : undefined;
const previousEvidence = existsSync(evidencePath) ? readFileSync(evidencePath, "utf8") : undefined;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runNodeScript(scriptPath: string, args: string[] = []): void {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
    cwd: root,
    encoding: "utf8"
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

function assertCleanSummary(): void {
  const evidenceText = readFileSync(evidencePath, "utf8");
  const evidence = JSON.parse(evidenceText) as PackagingQaEvidence;
  if (evidence.productionReady !== false) {
    fail("QA evidence must keep productionReady=false");
  }
  if (evidence.manualGuiQa?.status !== "result_passed") {
    fail(`Expected manualGuiQa.status=result_passed, got ${String(evidence.manualGuiQa?.status)}`);
  }
  if (evidence.manualGuiQa.requiredBeforeRelease !== false) {
    fail("Expected requiredBeforeRelease=false only for a structurally valid passed manual result");
  }
  if (evidence.manualGuiQa.result?.exists !== true || evidence.manualGuiQa.result.validationStatus !== "valid") {
    fail("Expected a valid summarized manual result");
  }
  if (evidence.manualGuiQa.result.status !== "passed" || evidence.manualGuiQa.result.passedSteps === undefined) {
    fail("Expected passed manual result step summary");
  }
  if (/"reviewerNote"|"evidenceNote"/u.test(evidenceText)) {
    fail("QA evidence must not copy manual reviewer or evidence notes");
  }
}

try {
  if (!existsSync(templatePath)) {
    runNodeScript("scripts/export-windows-manual-gui-qa-template.ts");
  }

  const template = JSON.parse(readFileSync(templatePath, "utf8")) as ManualGuiQaTemplate;
  const manualResult = {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-manual-gui-qa-result",
    status: "passed",
    productionReady: false,
    unsignedDraft: true,
    sourceChecklist: template.sourceChecklist,
    reviewer: {
      name: "QA Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      environment: "Synthetic QA evidence summary smoke environment"
    },
    steps: template.steps.map((step) => ({
      id: step.id,
      section: step.section,
      text: step.text,
      status: "passed",
      evidenceNote: `Synthetic result-summary fixture evidence for ${step.id}.`,
      reviewerNote: "Verifier smoke fixture; not a real manual GUI QA pass."
    })),
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify the QA evidence summary path.",
      "This file is removed after the smoke and is not real manual QA evidence.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(manualResult, null, 2)}\n`, "utf8");
  runNodeScript("scripts/verify-windows-manual-gui-qa-result.ts", [resultPath]);
  runNodeScript("scripts/export-windows-packaging-qa-evidence.ts");
  assertCleanSummary();
  runNodeScript("scripts/verify-windows-packaging-qa-evidence.ts");
  console.log("Windows packaging QA evidence manual-result smoke passed");
} finally {
  if (previousResult === undefined) {
    rmSync(resultPath, { force: true });
  } else {
    writeFileSync(resultPath, previousResult, "utf8");
  }

  if (previousEvidence === undefined) {
    rmSync(evidencePath, { force: true });
  } else {
    writeFileSync(evidencePath, previousEvidence, "utf8");
  }
}
