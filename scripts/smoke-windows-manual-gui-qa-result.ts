import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface ManualGuiQaStep {
  id: string;
  section: string;
  text: string;
  status: "pending" | "passed";
  evidenceNote: null | string;
  reviewerNote: null | string;
}

interface WindowsManualGuiQaTemplate {
  schemaVersion: 1;
  evidenceKind: "windows-manual-gui-qa-template";
  status: "template_pending";
  productionReady: false;
  unsignedDraft: true;
  sourceChecklist: {
    path: "docs/windows-packaging-manual-gui-checklist.md";
    itemCount: number;
  };
  linkedAutomatedEvidence?: unknown;
  reviewer: {
    name: null | string;
    completedAt: null | string;
    environment: null | string;
  };
  steps: ManualGuiQaStep[];
  completionRules?: string[];
  securityAssertions: {
    tokenRedactionRequired: true;
    fullLocalPathRedactionRequired: true;
    rawLogsExcluded: true;
    stackTracesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  limitations?: string[];
}

interface WindowsManualGuiQaResult extends Omit<WindowsManualGuiQaTemplate, "evidenceKind" | "status" | "reviewer" | "steps"> {
  evidenceKind: "windows-manual-gui-qa-result";
  status: "passed";
  reviewer: {
    name: string;
    completedAt: string;
    environment: string;
  };
  steps: Array<Omit<ManualGuiQaStep, "status" | "evidenceNote" | "reviewerNote"> & {
    status: "passed";
    evidenceNote: string;
    reviewerNote: string;
  }>;
}

const root = process.cwd();
const templatePath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-manual-gui-qa-template.json");
const smokeTempDir = mkdtempSync(join(tmpdir(), "lumatrace-manual-gui-result-"));
const resultPath = join(smokeTempDir, "lumatrace-windows-manual-gui-qa-result.json");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  const template = JSON.parse(readFileSync(templatePath, "utf8")) as WindowsManualGuiQaTemplate;
  const result: WindowsManualGuiQaResult = {
    ...template,
    evidenceKind: "windows-manual-gui-qa-result",
    status: "passed",
    productionReady: false,
    unsignedDraft: true,
    reviewer: {
      name: "QA Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      environment: "Synthetic verifier smoke environment"
    },
    steps: template.steps.map((step) => ({
      id: step.id,
      section: step.section,
      text: step.text,
      status: "passed",
      evidenceNote: `Synthetic schema-only evidence for ${step.id}.`,
      reviewerNote: "Verifier smoke fixture; this is not a real manual QA pass."
    }))
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const verification = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/verify-windows-manual-gui-qa-result.ts", resultPath],
    { cwd: root, encoding: "utf8" }
  );

  if (verification.stdout.trim().length > 0) {
    console.log(verification.stdout.trim());
  }
  if (verification.stderr.trim().length > 0) {
    console.error(verification.stderr.trim());
  }
  if (verification.status !== 0) {
    fail(`Manual GUI QA result verifier smoke failed with exit code ${String(verification.status)}`);
  }

  console.log("Windows manual GUI QA result verifier smoke passed");
} finally {
  rmSync(smokeTempDir, { recursive: true, force: true });
}
