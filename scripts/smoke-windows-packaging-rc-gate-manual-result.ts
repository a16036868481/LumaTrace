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

interface RcGate {
  productionReady?: boolean;
  rcCandidateReady?: boolean;
  gates?: Array<{
    id?: string;
    status?: string;
  }>;
  blockers?: Array<{
    code?: string;
  }>;
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const templatePath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json");
const resultPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json");
const evidencePath = resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json");
const rcGatePath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");
const previousResult = existsSync(resultPath) ? readFileSync(resultPath, "utf8") : undefined;
const previousEvidence = existsSync(evidencePath) ? readFileSync(evidencePath, "utf8") : undefined;
const previousRcGate = existsSync(rcGatePath) ? readFileSync(rcGatePath, "utf8") : undefined;

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

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function assertRcGateManualResultProgress(): void {
  const text = readFileSync(rcGatePath, "utf8");
  const rcGate = JSON.parse(text) as RcGate;
  const gateById = new Map((rcGate.gates ?? []).map((gate) => [gate.id, gate]));
  const blockerCodes = new Set((rcGate.blockers ?? []).map((blocker) => blocker.code));
  const manualGate = gateById.get("manual_gui_qa");

  if (!hasCleanText(text)) {
    fail("RC gate must remain sanitized after manual result summary");
  }
  if (rcGate.productionReady !== false || rcGate.rcCandidateReady !== false) {
    fail("Manual GUI QA progress must not mark the RC or production release ready");
  }
  if (manualGate?.status !== "passed") {
    fail(`Expected manual_gui_qa gate to pass, got ${String(manualGate?.status)}`);
  }
  if (blockerCodes.has("MANUAL_GUI_QA")) {
    fail("Manual GUI QA blocker should be absent after a validated passed manual result");
  }
  for (const blocker of ["SIDECAR_PRODUCTION_READINESS", "LICENSE_NOTICE_REVIEW", "CODE_SIGNING", "UPDATER_POLICY", "RELEASE_APPROVAL"]) {
    if (!blockerCodes.has(blocker)) {
      fail(`Expected remaining release blocker to stay present: ${blocker}`);
    }
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
      environment: "Synthetic RC gate manual-result smoke environment"
    },
    steps: template.steps.map((step) => ({
      id: step.id,
      section: step.section,
      text: step.text,
      status: "passed",
      evidenceNote: `Synthetic RC gate fixture evidence for ${step.id}.`,
      reviewerNote: "Verifier smoke fixture; not a real manual GUI QA pass."
    })),
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify RC gate manual-result progress.",
      "This file is removed after the smoke and is not real manual QA evidence.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(manualResult, null, 2)}\n`, "utf8");
  runNodeScript("scripts/verify-windows-manual-gui-qa-result.ts", [resultPath]);
  runNodeScript("scripts/export-windows-packaging-qa-evidence.ts");
  runNodeScript("scripts/export-windows-packaging-rc-gate.ts");
  assertRcGateManualResultProgress();
  runNodeScript("scripts/verify-windows-packaging-rc-gate.ts");
  console.log("Windows packaging RC gate manual-result smoke passed");
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

  if (previousRcGate === undefined) {
    rmSync(rcGatePath, { force: true });
  } else {
    writeFileSync(rcGatePath, previousRcGate, "utf8");
  }
}
