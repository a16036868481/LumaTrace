import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ApprovalEvidence {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  requiredForRc?: unknown;
}

interface WindowsReleaseApprovalReadinessTemplate {
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

const templatePath = resolve(
  "apps/desktop/src-tauri/target/release/lumatrace-windows-release-approval-readiness-template.json"
);

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function clean(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|reviewerNotes|evidenceNotes)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"approvalGranted"\s*:\s*true/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows release approval readiness template exists", existsSync(templatePath));
if (!existsSync(templatePath)) {
  process.exit(1);
}

const text = readFileSync(templatePath, "utf8");
const template = JSON.parse(text) as WindowsReleaseApprovalReadinessTemplate;
const evidence = template.evidence ?? [];

check("release approval template is sanitized", clean(text));
check(
  "evidence kind is windows-release-approval-readiness-template",
  template.evidenceKind === "windows-release-approval-readiness-template"
);
check("template status remains not_granted", template.status === "not_granted");
check("approval remains not granted", template.approvalGranted === false);
check("RC candidate remains false", template.rcCandidateReady === false);
check("productionReady remains false", template.productionReady === false);
check("unsigned draft remains true", template.unsignedDraft === true);
check("approver is not recorded", template.approval?.approverRecorded === false);
check("approver role is not recorded", template.approval?.approverRoleRecorded === false);
check("approvedAt is not recorded", template.approval?.approvedAtRecorded === false);
check("approval decision is pending", template.approval?.decision === "pending");
check("release notes are not approved", template.approval?.releaseNotesApproved === false);
check("manual GUI QA remains required", template.requiredEvidence?.manualGuiQaPassed === false);
check("license review remains required", template.requiredEvidence?.licenseReviewApproved === false);
check("code signing remains required", template.requiredEvidence?.codeSigningVerified === false);
check("updater policy remains required", template.requiredEvidence?.updaterPolicyConfigured === false);
check("sidecar production readiness remains required", template.requiredEvidence?.sidecarProductionReady === false);
check("smoke suite status is boolean", typeof template.requiredEvidence?.smokeSuitePassed === "boolean");
check("approval evidence is present", evidence.length >= 5);
check(
  "RC gate evidence is represented",
  evidence.some((item) => item.fileName === "lumatrace-windows-packaging-rc-gate.json")
);
check("evidence uses relative file names", evidence.every((item) => typeof item.fileName === "string" && !/[\\/]/u.test(item.fileName)));
check("all evidence is RC-required", evidence.every((item) => item.requiredForRc === true));
check("existing evidence has hashes", evidence.filter((item) => item.exists === true).every((item) => typeof item.sha256 === "string"));
check("reviewer name starts empty", template.reviewer?.name === null);
check("reviewer completedAt starts empty", template.reviewer?.completedAt === null);
check("reviewer decision starts pending", template.reviewer?.decision === "pending");
check("token redaction asserted", template.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", template.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", template.securityAssertions?.rawLogsExcluded === true);
check("reviewer notes excluded", template.securityAssertions?.reviewerNotesExcluded === true);
check("stack traces excluded", template.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows release approval readiness template verification failed");
  process.exit(1);
}

console.log("Windows release approval readiness template verification passed");
