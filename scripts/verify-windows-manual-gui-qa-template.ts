import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ManualGuiQaStep {
  id?: unknown;
  section?: unknown;
  text?: unknown;
  status?: unknown;
  evidenceNote?: unknown;
  reviewerNote?: unknown;
}

interface WindowsManualGuiQaTemplate {
  evidenceKind?: unknown;
  status?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  sourceChecklist?: {
    path?: unknown;
    sectionCount?: unknown;
    itemCount?: unknown;
  };
  linkedAutomatedEvidence?: {
    fileName?: unknown;
    exists?: unknown;
  };
  reviewer?: {
    name?: unknown;
    completedAt?: unknown;
    environment?: unknown;
  };
  steps?: ManualGuiQaStep[];
  securityAssertions?: {
    tokenRedactionRequired?: unknown;
    fullLocalPathRedactionRequired?: unknown;
    rawLogsExcluded?: unknown;
    stackTracesExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const templatePath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-manual-gui-qa-template.json");

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function hasCleanText(text: string): boolean {
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text) &&
    !/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(text) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(text) &&
    !/"productionReady"\s*:\s*true/u.test(text)
  );
}

check("manual GUI QA template exists", existsSync(templatePath));
if (!existsSync(templatePath)) {
  process.exit(1);
}

const text = readFileSync(templatePath, "utf8");
const template = JSON.parse(text) as WindowsManualGuiQaTemplate;
const steps = template.steps ?? [];
const stepIds = new Set(steps.map((step) => step.id).filter((id): id is string => typeof id === "string"));

check("manual GUI QA template is sanitized", hasCleanText(text));
check("evidence kind is windows-manual-gui-qa-template", template.evidenceKind === "windows-manual-gui-qa-template");
check("template status remains pending", template.status === "template_pending");
check("productionReady remains false", template.productionReady === false);
check("unsigned draft is explicit", template.unsignedDraft === true);
check("source checklist is relative", template.sourceChecklist?.path === "docs/windows-packaging-manual-gui-checklist.md");
check(
  "source checklist section count recorded",
  typeof template.sourceChecklist?.sectionCount === "number" && template.sourceChecklist.sectionCount > 0
);
check(
  "source checklist item count recorded",
  typeof template.sourceChecklist?.itemCount === "number" && template.sourceChecklist.itemCount > 0
);
check("steps match source item count", template.sourceChecklist?.itemCount === steps.length);
check("step ids are unique", stepIds.size === steps.length);
check("automated QA evidence file is linked", template.linkedAutomatedEvidence?.fileName === "lumatrace-windows-packaging-qa-evidence.json");
check("reviewer name starts empty", template.reviewer?.name === null);
check("reviewer completedAt starts empty", template.reviewer?.completedAt === null);
check("reviewer environment starts empty", template.reviewer?.environment === null);
check("all steps are pending", steps.every((step) => step.status === "pending"));
check("all step evidence notes are empty", steps.every((step) => step.evidenceNote === null));
check("all step reviewer notes are empty", steps.every((step) => step.reviewerNote === null));
check("all steps have section and text", steps.every((step) => typeof step.section === "string" && typeof step.text === "string"));
check("token redaction remains required", template.securityAssertions?.tokenRedactionRequired === true);
check("path redaction remains required", template.securityAssertions?.fullLocalPathRedactionRequired === true);
check("raw logs remain excluded", template.securityAssertions?.rawLogsExcluded === true);
check("stack traces remain excluded", template.securityAssertions?.stackTracesExcluded === true);
check("public sidecar listeners remain disallowed", template.securityAssertions?.publicSidecarListenersAllowed === false);

if (process.exitCode === 1) {
  console.error("Windows manual GUI QA template verification failed");
  process.exit(1);
}

console.log("Windows manual GUI QA template verification passed");
