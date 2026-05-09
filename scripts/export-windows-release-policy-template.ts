import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ReleasePolicyTemplate {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-release-policy-template";
  status: "draft_blocked";
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  policy: {
    codeSigning: {
      status: "configured_verified" | "not_configured";
      certificateConfigured: boolean;
      timestampServerConfigured: boolean;
      verificationConfigured: boolean;
      codeSigningTemplateFile?: string;
      codeSigningTemplateStatus?: JsonValue;
      codeSigningResultFile?: string;
      codeSigningResultStatus?: JsonValue;
      requiredForRc: true;
    };
    updater: {
      status: "policy_decided" | "not_configured";
      updaterConfigured: boolean;
      updateSigningConfigured: boolean;
      rollbackPolicyConfigured: boolean;
      updaterTemplateFile?: string;
      updaterTemplateStatus?: JsonValue;
      updaterResultFile?: string;
      updaterResultStatus?: JsonValue;
      requiredForRc: true;
    };
    releaseApproval: {
      status: "approved" | "not_granted";
      approvalGranted: boolean;
      approverRecorded: boolean;
      releaseApprovalTemplateFile?: string;
      releaseApprovalTemplateStatus?: JsonValue;
      releaseApprovalResultFile?: string;
      releaseApprovalResultStatus?: JsonValue;
      requiredForRc: true;
    };
    licenseReview: {
      status: "approved" | "draft_requires_review";
      approved: boolean;
      noticesFile?: string;
      thirdPartyNoticesFile?: string;
      licenseReviewTemplateFile?: string;
      licenseReviewTemplateStatus?: JsonValue;
      licenseReviewResultFile?: string;
      licenseReviewResultStatus?: JsonValue;
      licenseReviewStatus?: JsonValue;
      missingLicenseCount?: number;
      requiredForRc: true;
    };
  };
  securityBoundaries: {
    arbitraryShellAllowed: false;
    localhostOnly: true;
    tokenInVite: false;
    tokenInLocalStorage: false;
    rawLogsInReport: false;
    cloudUploadDefault: false;
  };
  blockers: Array<{
    code: string;
    reason: string;
    requiredForRc: true;
  }>;
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const outputPath = resolve(releaseDir, "lumatrace-windows-release-policy-template.json");
const sidecarManifestPath = resolve(binariesDir, "sidecar-manifest.json");
const noticesPath = resolve(binariesDir, "packaging-notices.json");
const licenseReviewTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-license-review-template.json"
);
const licenseReviewResultPath = resolve(
  releaseDir,
  "lumatrace-windows-license-review-result.json"
);
const codeSigningTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-code-signing-readiness-template.json"
);
const codeSigningResultPath = resolve(
  releaseDir,
  "lumatrace-windows-code-signing-readiness-result.json"
);
const updaterTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-updater-policy-readiness-template.json"
);
const updaterResultPath = resolve(
  releaseDir,
  "lumatrace-windows-updater-policy-readiness-result.json"
);
const releaseApprovalTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-template.json"
);
const releaseApprovalResultPath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-result.json"
);

function readJson(path: string): Record<string, JsonValue> {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, JsonValue>)
    : {};
}

function stringField(document: Record<string, JsonValue>, name: string): string | undefined {
  const value = document[name];
  return typeof value === "string" ? value : undefined;
}

function countMissingLicenses(document: Record<string, JsonValue>): number | undefined {
  const entries = document.entries;
  if (!Array.isArray(entries)) {
    return undefined;
  }
  return entries.filter((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    return entry.license === "UNKNOWN" || entry.reviewStatus === "missing_license";
  }).length;
}

function sha256(path: string): string | undefined {
  return existsSync(path)
    ? createHash("sha256").update(readFileSync(path)).digest("hex")
    : undefined;
}

const sidecar = readJson(sidecarManifestPath);
const notices = readJson(noticesPath);
const licenseReviewTemplate = readJson(licenseReviewTemplatePath);
const licenseReviewResult = readJson(licenseReviewResultPath);
const codeSigningTemplate = readJson(codeSigningTemplatePath);
const codeSigningResult = readJson(codeSigningResultPath);
const updaterTemplate = readJson(updaterTemplatePath);
const updaterResult = readJson(updaterResultPath);
const releaseApprovalTemplate = readJson(releaseApprovalTemplatePath);
const releaseApprovalResult = readJson(releaseApprovalResultPath);
const noticesFile = stringField(sidecar, "noticesFile");
const thirdPartyNoticesFile = stringField(sidecar, "thirdPartyNoticesFile");
const licenseReviewApproved =
  licenseReviewResult.evidenceKind === "windows-license-review-result" &&
  licenseReviewResult.status === "approved" &&
  licenseReviewResult.approved === true;
const codeSigningConfigured =
  codeSigningResult.evidenceKind === "windows-code-signing-readiness-result" &&
  codeSigningResult.status === "configured_verified" &&
  codeSigningResult.configured === true;
const updaterPolicyConfigured =
  updaterResult.evidenceKind === "windows-updater-policy-readiness-result" &&
  updaterResult.status === "policy_decided" &&
  updaterResult.configured === true;
const releaseApprovalGranted =
  releaseApprovalResult.evidenceKind === "windows-release-approval-readiness-result" &&
  releaseApprovalResult.status === "approved" &&
  releaseApprovalResult.approvalGranted === true;
const blockers = [
  ...(codeSigningConfigured
    ? []
    : [
        {
          code: "CODE_SIGNING_NOT_CONFIGURED",
          reason:
            "Windows signing certificate, timestamping, and signature verification policy are not configured.",
          requiredForRc: true
        }
      ]),
  ...(updaterPolicyConfigured
    ? []
    : [
        {
          code: "UPDATER_POLICY_NOT_CONFIGURED",
          reason: "Updater strategy, update signing, and rollback policy are not configured.",
          requiredForRc: true
        }
      ]),
  ...(licenseReviewApproved
    ? []
    : [
        {
          code: "LICENSE_REVIEW_NOT_APPROVED",
          reason:
            "Bundled runtime and dependency license notices are generated for draft review but not approved.",
          requiredForRc: true
        }
      ]),
  ...(releaseApprovalGranted
    ? []
    : [
        {
          code: "RELEASE_APPROVAL_NOT_GRANTED",
          reason: "Production release approval is not granted.",
          requiredForRc: true
        }
      ])
];

const template: ReleasePolicyTemplate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-release-policy-template",
  status: "draft_blocked",
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  policy: {
    codeSigning: {
      status: codeSigningConfigured ? "configured_verified" : "not_configured",
      certificateConfigured: codeSigningConfigured,
      timestampServerConfigured: codeSigningConfigured,
      verificationConfigured: codeSigningConfigured,
      ...(existsSync(codeSigningTemplatePath)
        ? { codeSigningTemplateFile: "lumatrace-windows-code-signing-readiness-template.json" }
        : {}),
      ...(codeSigningTemplate.status === undefined
        ? {}
        : { codeSigningTemplateStatus: codeSigningTemplate.status }),
      ...(existsSync(codeSigningResultPath)
        ? { codeSigningResultFile: "lumatrace-windows-code-signing-readiness-result.json" }
        : {}),
      ...(codeSigningResult.status === undefined
        ? {}
        : { codeSigningResultStatus: codeSigningResult.status }),
      requiredForRc: true
    },
    updater: {
      status: updaterPolicyConfigured ? "policy_decided" : "not_configured",
      updaterConfigured: updaterPolicyConfigured,
      updateSigningConfigured: updaterPolicyConfigured,
      rollbackPolicyConfigured: updaterPolicyConfigured,
      ...(existsSync(updaterTemplatePath)
        ? { updaterTemplateFile: "lumatrace-windows-updater-policy-readiness-template.json" }
        : {}),
      ...(updaterTemplate.status === undefined
        ? {}
        : { updaterTemplateStatus: updaterTemplate.status }),
      ...(existsSync(updaterResultPath)
        ? { updaterResultFile: "lumatrace-windows-updater-policy-readiness-result.json" }
        : {}),
      ...(updaterResult.status === undefined ? {} : { updaterResultStatus: updaterResult.status }),
      requiredForRc: true
    },
    releaseApproval: {
      status: releaseApprovalGranted ? "approved" : "not_granted",
      approvalGranted: releaseApprovalGranted,
      approverRecorded: releaseApprovalGranted,
      ...(existsSync(releaseApprovalTemplatePath)
        ? {
            releaseApprovalTemplateFile:
              "lumatrace-windows-release-approval-readiness-template.json"
          }
        : {}),
      ...(releaseApprovalTemplate.status === undefined
        ? {}
        : { releaseApprovalTemplateStatus: releaseApprovalTemplate.status }),
      ...(existsSync(releaseApprovalResultPath)
        ? {
            releaseApprovalResultFile: "lumatrace-windows-release-approval-readiness-result.json"
          }
        : {}),
      ...(releaseApprovalResult.status === undefined
        ? {}
        : { releaseApprovalResultStatus: releaseApprovalResult.status }),
      requiredForRc: true
    },
    licenseReview: {
      status: licenseReviewApproved ? "approved" : "draft_requires_review",
      approved: licenseReviewApproved,
      ...(noticesFile === undefined ? {} : { noticesFile }),
      ...(thirdPartyNoticesFile === undefined ? {} : { thirdPartyNoticesFile }),
      ...(existsSync(licenseReviewTemplatePath)
        ? { licenseReviewTemplateFile: "lumatrace-windows-license-review-template.json" }
        : {}),
      ...(licenseReviewTemplate.status === undefined
        ? {}
        : { licenseReviewTemplateStatus: licenseReviewTemplate.status }),
      ...(existsSync(licenseReviewResultPath)
        ? { licenseReviewResultFile: "lumatrace-windows-license-review-result.json" }
        : {}),
      ...(licenseReviewResult.status === undefined
        ? {}
        : { licenseReviewResultStatus: licenseReviewResult.status }),
      ...(sidecar.licenseReviewStatus === undefined
        ? {}
        : { licenseReviewStatus: sidecar.licenseReviewStatus }),
      ...(countMissingLicenses(notices) === undefined
        ? {}
        : { missingLicenseCount: countMissingLicenses(notices) }),
      requiredForRc: true
    }
  },
  securityBoundaries: {
    arbitraryShellAllowed: false,
    localhostOnly: true,
    tokenInVite: false,
    tokenInLocalStorage: false,
    rawLogsInReport: false,
    cloudUploadDefault: false
  },
  blockers,
  limitations: [
    "This template is a sanitized draft input for the Windows packaging RC gate.",
    "It does not configure code signing, updater behavior, release approval, or license approval.",
    "It records booleans, artifact file names, and blocker codes only.",
    "It must not contain auth tokens, full local paths, raw logs, command lines, raw CSV, stack traces, or secrets.",
    `packaging-notices-sha256=${sha256(noticesPath) ?? "missing"}`
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`Windows release policy template written to ${outputPath}`);
console.log(`status=${template.status}`);
console.log(`blockers=${template.blockers.map((blocker) => blocker.code).join(",")}`);
