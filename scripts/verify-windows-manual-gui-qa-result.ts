import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

interface ManualGuiQaStep {
  id?: unknown;
  section?: unknown;
  text?: unknown;
  status?: unknown;
  evidenceNote?: unknown;
  reviewerNote?: unknown;
}

interface ReviewerInfo {
  name?: unknown;
  completedAt?: unknown;
  environment?: unknown;
}

interface WindowsManualGuiQaDocument {
  evidenceKind?: unknown;
  status?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  sourceChecklist?: {
    path?: unknown;
    itemCount?: unknown;
  };
  reviewer?: ReviewerInfo;
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
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const defaultResultPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json");
const templatePath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json");
const resultPathArg = process.argv[2];
const resultPath =
  resultPathArg === undefined
    ? defaultResultPath
    : isAbsolute(resultPathArg)
      ? resultPathArg
      : resolve(root, resultPathArg);

const allowedStepStatuses = new Set(["passed", "failed", "blocked"]);

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasReviewerNote(value: unknown): boolean {
  return typeof value === "string" && value.trim().length >= 4;
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/LUMATRACE_AUTH_TOKEN\s*=\s*[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/"(?:authToken|token)"\s*:\s*"[^"]{8,}"/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

function parseJsonFile(path: string): WindowsManualGuiQaDocument {
  return JSON.parse(readFileSync(path, "utf8")) as WindowsManualGuiQaDocument;
}

function expectedStatusForSteps(steps: ManualGuiQaStep[]): "passed" | "failed" | "blocked" {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }
  if (steps.some((step) => step.status === "blocked")) {
    return "blocked";
  }
  return "passed";
}

check("manual GUI QA template exists", existsSync(templatePath));
check("manual GUI QA result exists", existsSync(resultPath));

if (!existsSync(templatePath) || !existsSync(resultPath)) {
  console.error(
    "Run pnpm verify:windows-manual-gui-qa-template first, then pass a filled result JSON path to this verifier."
  );
  process.exit(1);
}

const templateText = readFileSync(templatePath, "utf8");
const resultText = readFileSync(resultPath, "utf8");
const template = JSON.parse(templateText) as WindowsManualGuiQaDocument;
const result = parseJsonFile(resultPath);
const templateSteps = template.steps ?? [];
const resultSteps = result.steps ?? [];
const templateStepIds = templateSteps
  .map((step) => step.id)
  .filter((id): id is string => typeof id === "string");
const resultStepIds = resultSteps
  .map((step) => step.id)
  .filter((id): id is string => typeof id === "string");
const resultStepIdSet = new Set(resultStepIds);

check("manual GUI QA result is sanitized", hasCleanText(resultText));
check("result evidence kind is windows-manual-gui-qa-result", result.evidenceKind === "windows-manual-gui-qa-result");
check("productionReady remains false", result.productionReady === false);
check("unsigned draft remains explicit", result.unsignedDraft === true);
check("source checklist remains relative", result.sourceChecklist?.path === "docs/windows-packaging-manual-gui-checklist.md");
check("source checklist item count matches template", result.sourceChecklist?.itemCount === templateSteps.length);
check("reviewer name is filled", isNonEmptyString(result.reviewer?.name));
check("reviewer completedAt is filled", isNonEmptyString(result.reviewer?.completedAt));
check("reviewer environment is filled", isNonEmptyString(result.reviewer?.environment));
check("result has same step count as template", resultSteps.length === templateSteps.length);
check("result step ids are unique", resultStepIdSet.size === resultSteps.length);
check("result contains every template step id", templateStepIds.every((id) => resultStepIdSet.has(id)));
check("all result step statuses are final", resultSteps.every((step) => allowedStepStatuses.has(String(step.status))));
check("result has no pending steps", resultSteps.every((step) => step.status !== "pending"));
check(
  "passed steps include reviewer or evidence note",
  resultSteps
    .filter((step) => step.status === "passed")
    .every((step) => hasReviewerNote(step.reviewerNote) || hasReviewerNote(step.evidenceNote))
);
check(
  "failed or blocked steps include reviewer note",
  resultSteps
    .filter((step) => step.status === "failed" || step.status === "blocked")
    .every((step) => hasReviewerNote(step.reviewerNote))
);
check("overall status matches step outcomes", result.status === expectedStatusForSteps(resultSteps));
check("token redaction remains required", result.securityAssertions?.tokenRedactionRequired === true);
check("path redaction remains required", result.securityAssertions?.fullLocalPathRedactionRequired === true);
check("raw logs remain excluded", result.securityAssertions?.rawLogsExcluded === true);
check("stack traces remain excluded", result.securityAssertions?.stackTracesExcluded === true);
check("public sidecar listeners remain disallowed", result.securityAssertions?.publicSidecarListenersAllowed === false);

if (process.exitCode === 1) {
  console.error("Windows manual GUI QA result verification failed");
  process.exit(1);
}

console.log("Windows manual GUI QA result verification passed");
