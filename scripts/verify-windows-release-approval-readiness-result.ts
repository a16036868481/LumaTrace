import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

interface ApprovalEvidence {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  requiredForRc?: unknown;
  reviewed?: unknown;
}

interface WindowsReleaseApprovalReadinessDocument {
  evidenceKind?: unknown;
  status?: unknown;
  approvalGranted?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  approval?: {
    approverRecorded?: unknown;
    approverRoleRecorded?: unknown;
    approvedAtRecorded?: unknown;
    decision?: unknown;
    releaseNotesApproved?: unknown;
    approverNameSanitized?: unknown;
    approverRoleSanitized?: unknown;
  };
  requiredEvidence?: {
    manualGuiQaPassed?: unknown;
    licenseReviewApproved?: unknown;
    codeSigningVerified?: unknown;
    updaterPolicyConfigured?: unknown;
    sidecarProductionReady?: unknown;
    smokeSuitePassed?: unknown;
  };
  evidence?: ApprovalEvidence[];
  reviewer?: {
    name?: unknown;
    completedAt?: unknown;
    decision?: unknown;
  };
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    reviewerNotesExcluded?: unknown;
    stackTracesExcluded?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const defaultResultPath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-result.json"
);
const templatePath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-template.json"
);
const resultPathArg = process.argv[2];
const resultPath =
  resultPathArg === undefined
    ? defaultResultPath
    : isAbsolute(resultPathArg)
      ? resultPathArg
      : resolve(root, resultPathArg);

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/LUMATRACE_AUTH_TOKEN\s*=\s*[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/"(?:authToken|token|secret|password)"\s*:\s*"[^"]{3,}"/iu.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|reviewerNotes|evidenceNotes)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function readJson(path: string): WindowsReleaseApprovalReadinessDocument {
  return JSON.parse(readFileSync(path, "utf8")) as WindowsReleaseApprovalReadinessDocument;
}

check("release approval readiness template exists", existsSync(templatePath));
check("release approval readiness result exists", existsSync(resultPath));

if (!existsSync(templatePath) || !existsSync(resultPath)) {
  console.error(
    "Run pnpm verify:windows-release-approval-readiness-template first, then pass a filled result JSON path to this verifier."
  );
  process.exit(1);
}

const template = readJson(templatePath);
const resultText = readFileSync(resultPath, "utf8");
const result = readJson(resultPath);
const templateEvidence = template.evidence ?? [];
const resultEvidence = result.evidence ?? [];
const templateFileNames = templateEvidence
  .map((item) => item.fileName)
  .filter((fileName): fileName is string => typeof fileName === "string");
const resultFileNames = resultEvidence
  .map((item) => item.fileName)
  .filter((fileName): fileName is string => typeof fileName === "string");
const resultFileNameSet = new Set(resultFileNames);

check("release approval readiness result is sanitized", hasCleanText(resultText));
check(
  "result evidence kind is windows-release-approval-readiness-result",
  result.evidenceKind === "windows-release-approval-readiness-result"
);
check("result status is approved", result.status === "approved");
check("approvalGranted is true", result.approvalGranted === true);
check("RC candidate remains false", result.rcCandidateReady === false);
check("productionReady remains false", result.productionReady === false);
check("unsigned draft remains explicit", result.unsignedDraft === true);
check("approver is recorded", result.approval?.approverRecorded === true);
check("approver role is recorded", result.approval?.approverRoleRecorded === true);
check("approvedAt is recorded", result.approval?.approvedAtRecorded === true);
check("approval decision is approved", result.approval?.decision === "approved");
check("release notes are approved", result.approval?.releaseNotesApproved === true);
check(
  "approver name summary is sanitized",
  isNonEmptyString(result.approval?.approverNameSanitized)
);
check(
  "approver role summary is sanitized",
  isNonEmptyString(result.approval?.approverRoleSanitized)
);
check("manual GUI QA is marked passed", result.requiredEvidence?.manualGuiQaPassed === true);
check("license review is marked approved", result.requiredEvidence?.licenseReviewApproved === true);
check("code signing is marked verified", result.requiredEvidence?.codeSigningVerified === true);
check(
  "updater policy is marked configured",
  result.requiredEvidence?.updaterPolicyConfigured === true
);
check(
  "sidecar production readiness is marked ready",
  result.requiredEvidence?.sidecarProductionReady === true
);
check("smoke suite is marked passed", result.requiredEvidence?.smokeSuitePassed === true);
check(
  "result has same evidence count as template",
  resultEvidence.length === templateEvidence.length
);
check("result evidence file names are unique", resultFileNameSet.size === resultEvidence.length);
check(
  "result contains every template evidence file",
  templateFileNames.every((fileName) => resultFileNameSet.has(fileName))
);
check(
  "all existing evidence retains original hashes",
  templateEvidence
    .filter((item) => item.exists === true)
    .every((templateItem) =>
      resultEvidence.some(
        (item) =>
          item.fileName === templateItem.fileName &&
          item.sha256 === templateItem.sha256 &&
          item.reviewed === true
      )
    )
);
check(
  "evidence uses relative names",
  resultEvidence.every((item) => typeof item.fileName === "string" && !/[\\/]/u.test(item.fileName))
);
check("reviewer name is filled", isNonEmptyString(result.reviewer?.name));
check("reviewer completedAt is filled", isNonEmptyString(result.reviewer?.completedAt));
check("reviewer decision is approved", result.reviewer?.decision === "approved");
check("token redaction asserted", result.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", result.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", result.securityAssertions?.rawLogsExcluded === true);
check("reviewer notes excluded", result.securityAssertions?.reviewerNotesExcluded === true);
check("stack traces excluded", result.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows release approval readiness result verification failed");
  process.exit(1);
}

console.log("Windows release approval readiness result verification passed");
