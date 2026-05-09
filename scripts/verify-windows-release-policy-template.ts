import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ReleasePolicyTemplate {
  evidenceKind?: unknown;
  status?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  policy?: {
    codeSigning?: {
      status?: unknown;
      certificateConfigured?: unknown;
      timestampServerConfigured?: unknown;
      verificationConfigured?: unknown;
      codeSigningTemplateFile?: unknown;
      codeSigningTemplateStatus?: unknown;
      codeSigningResultFile?: unknown;
      codeSigningResultStatus?: unknown;
      requiredForRc?: unknown;
    };
    updater?: {
      status?: unknown;
      updaterConfigured?: unknown;
      updateSigningConfigured?: unknown;
      rollbackPolicyConfigured?: unknown;
      updaterTemplateFile?: unknown;
      updaterTemplateStatus?: unknown;
      updaterResultFile?: unknown;
      updaterResultStatus?: unknown;
      requiredForRc?: unknown;
    };
    releaseApproval?: {
      status?: unknown;
      approvalGranted?: unknown;
      approverRecorded?: unknown;
      releaseApprovalTemplateFile?: unknown;
      releaseApprovalTemplateStatus?: unknown;
      releaseApprovalResultFile?: unknown;
      releaseApprovalResultStatus?: unknown;
      requiredForRc?: unknown;
    };
    licenseReview?: {
      status?: unknown;
      approved?: unknown;
      licenseReviewTemplateFile?: unknown;
      licenseReviewTemplateStatus?: unknown;
      licenseReviewResultFile?: unknown;
      licenseReviewResultStatus?: unknown;
      requiredForRc?: unknown;
    };
  };
  securityBoundaries?: {
    arbitraryShellAllowed?: unknown;
    localhostOnly?: unknown;
    tokenInVite?: unknown;
    tokenInLocalStorage?: unknown;
    rawLogsInReport?: unknown;
    cloudUploadDefault?: unknown;
  };
  blockers?: Array<{ code?: unknown; requiredForRc?: unknown }>;
}

const policyPath = resolve(
  "apps/desktop/src-tauri/target/release/lumatrace-windows-release-policy-template.json"
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows release policy template exists", existsSync(policyPath));
if (!existsSync(policyPath)) {
  process.exit(1);
}

const text = readFileSync(policyPath, "utf8");
const policy = JSON.parse(text) as ReleasePolicyTemplate;
const blockers = new Set(
  (policy.blockers ?? [])
    .map((blocker) => blocker.code)
    .filter((code): code is string => typeof code === "string")
);

check("release policy template is sanitized", clean(text));
check(
  "evidence kind is windows-release-policy-template",
  policy.evidenceKind === "windows-release-policy-template"
);
check("policy status remains draft_blocked", policy.status === "draft_blocked");
check("RC candidate remains false", policy.rcCandidateReady === false);
check("productionReady remains false", policy.productionReady === false);
check("unsigned draft remains true", policy.unsignedDraft === true);
check(
  "code signing readiness template is linked",
  policy.policy?.codeSigning?.codeSigningTemplateFile ===
    "lumatrace-windows-code-signing-readiness-template.json"
);
check(
  "code signing readiness template remains not configured",
  policy.policy?.codeSigning?.codeSigningTemplateStatus === "not_configured"
);
if (policy.policy?.codeSigning?.status === "configured_verified") {
  check(
    "code signing certificate configured when result exists",
    policy.policy.codeSigning.certificateConfigured === true
  );
  check(
    "code signing verification configured when result exists",
    policy.policy.codeSigning.verificationConfigured === true
  );
  check(
    "code signing result is linked",
    policy.policy.codeSigning.codeSigningResultFile ===
      "lumatrace-windows-code-signing-readiness-result.json"
  );
  check(
    "code signing blocker absent when configured",
    !blockers.has("CODE_SIGNING_NOT_CONFIGURED")
  );
} else {
  check(
    "code signing remains not configured",
    policy.policy?.codeSigning?.status === "not_configured"
  );
  check(
    "code signing certificate absent",
    policy.policy?.codeSigning?.certificateConfigured === false
  );
  check(
    "code signing verification absent",
    policy.policy?.codeSigning?.verificationConfigured === false
  );
  check("blocker present: code signing", blockers.has("CODE_SIGNING_NOT_CONFIGURED"));
}
check(
  "updater policy readiness template is linked",
  policy.policy?.updater?.updaterTemplateFile ===
    "lumatrace-windows-updater-policy-readiness-template.json"
);
check(
  "updater policy readiness template remains not configured",
  policy.policy?.updater?.updaterTemplateStatus === "not_configured"
);
if (policy.policy?.updater?.status === "policy_decided") {
  check(
    "updater policy configured when result exists",
    policy.policy.updater.updaterConfigured === true
  );
  check(
    "updater signing policy configured when result exists",
    policy.policy.updater.updateSigningConfigured === true
  );
  check(
    "rollback policy configured when result exists",
    policy.policy.updater.rollbackPolicyConfigured === true
  );
  check(
    "updater policy result is linked",
    policy.policy.updater.updaterResultFile ===
      "lumatrace-windows-updater-policy-readiness-result.json"
  );
  check(
    "updater blocker absent when policy decided",
    !blockers.has("UPDATER_POLICY_NOT_CONFIGURED")
  );
} else {
  check("updater remains not configured", policy.policy?.updater?.status === "not_configured");
  check("updater policy absent", policy.policy?.updater?.updaterConfigured === false);
  check("updater signing absent", policy.policy?.updater?.updateSigningConfigured === false);
  check("blocker present: updater", blockers.has("UPDATER_POLICY_NOT_CONFIGURED"));
}
check(
  "release approval readiness template is linked",
  policy.policy?.releaseApproval?.releaseApprovalTemplateFile ===
    "lumatrace-windows-release-approval-readiness-template.json"
);
check(
  "release approval readiness template remains not granted",
  policy.policy?.releaseApproval?.releaseApprovalTemplateStatus === "not_granted"
);
if (policy.policy?.releaseApproval?.status === "approved") {
  check(
    "release approval is granted when result exists",
    policy.policy.releaseApproval.approvalGranted === true
  );
  check(
    "release approver is recorded when result exists",
    policy.policy.releaseApproval.approverRecorded === true
  );
  check(
    "release approval result is linked",
    policy.policy.releaseApproval.releaseApprovalResultFile ===
      "lumatrace-windows-release-approval-readiness-result.json"
  );
  check(
    "release approval result status is approved",
    policy.policy.releaseApproval.releaseApprovalResultStatus === "approved"
  );
  check(
    "release approval blocker absent when approved",
    !blockers.has("RELEASE_APPROVAL_NOT_GRANTED")
  );
} else {
  check(
    "release approval remains not granted",
    policy.policy?.releaseApproval?.status === "not_granted"
  );
  check("release approval not granted", policy.policy?.releaseApproval?.approvalGranted === false);
  check(
    "release approver not recorded",
    policy.policy?.releaseApproval?.approverRecorded === false
  );
  check("blocker present: release approval", blockers.has("RELEASE_APPROVAL_NOT_GRANTED"));
}
check(
  "license review template is linked",
  policy.policy?.licenseReview?.licenseReviewTemplateFile ===
    "lumatrace-windows-license-review-template.json"
);
check(
  "license review template remains draft",
  policy.policy?.licenseReview?.licenseReviewTemplateStatus === "draft_requires_review"
);
if (policy.policy?.licenseReview?.approved === true) {
  check(
    "license review status is approved when result exists",
    policy.policy.licenseReview.status === "approved"
  );
  check(
    "license review result is linked",
    policy.policy.licenseReview.licenseReviewResultFile ===
      "lumatrace-windows-license-review-result.json"
  );
  check(
    "license review blocker absent when approved",
    !blockers.has("LICENSE_REVIEW_NOT_APPROVED")
  );
} else {
  check("license review is not approved", policy.policy?.licenseReview?.approved === false);
  check(
    "license review remains draft without approved result",
    policy.policy?.licenseReview?.status === "draft_requires_review"
  );
  check("blocker present: license review", blockers.has("LICENSE_REVIEW_NOT_APPROVED"));
}
check(
  "all policy sections are required for RC",
  [
    policy.policy?.codeSigning?.requiredForRc,
    policy.policy?.updater?.requiredForRc,
    policy.policy?.releaseApproval?.requiredForRc,
    policy.policy?.licenseReview?.requiredForRc
  ].every((value) => value === true)
);
check(
  "arbitrary shell remains disallowed",
  policy.securityBoundaries?.arbitraryShellAllowed === false
);
check("localhost-only remains required", policy.securityBoundaries?.localhostOnly === true);
check("token is not in VITE", policy.securityBoundaries?.tokenInVite === false);
check("token is not in localStorage", policy.securityBoundaries?.tokenInLocalStorage === false);
check("raw logs are not in report", policy.securityBoundaries?.rawLogsInReport === false);
check(
  "cloud upload remains off by default",
  policy.securityBoundaries?.cloudUploadDefault === false
);
check(
  "all blockers required for RC",
  (policy.blockers ?? []).every((blocker) => blocker.requiredForRc === true)
);

if (process.exitCode === 1) {
  console.error("Windows release policy template verification failed");
  process.exit(1);
}

console.log("Windows release policy template verification passed");
