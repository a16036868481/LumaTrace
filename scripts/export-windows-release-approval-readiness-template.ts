import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface ApprovalEvidence {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  requiredForRc: true;
}

interface WindowsReleaseApprovalReadinessTemplate {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-release-approval-readiness-template";
  status: "not_granted";
  approvalGranted: false;
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  approval: {
    approverRecorded: false;
    approverRoleRecorded: false;
    approvedAtRecorded: false;
    decision: "pending";
    releaseNotesApproved: false;
  };
  requiredEvidence: {
    manualGuiQaPassed: false;
    licenseReviewApproved: false;
    codeSigningVerified: false;
    updaterPolicyConfigured: false;
    sidecarProductionReady: false;
    smokeSuitePassed: true | false;
  };
  evidence: ApprovalEvidence[];
  reviewer: {
    name: null;
    completedAt: null;
    decision: "pending";
  };
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    reviewerNotesExcluded: true;
    stackTracesExcluded: true;
  };
  completionRules: string[];
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const outputPath = resolve(releaseDir, "lumatrace-windows-release-approval-readiness-template.json");

const approvalEvidenceFileNames = [
  "lumatrace-windows-packaging-rc-gate.json",
  "lumatrace-windows-packaging-qa-evidence.json",
  "lumatrace-windows-release-policy-template.json",
  "lumatrace-windows-license-review-template.json",
  "lumatrace-windows-code-signing-readiness-template.json",
  "lumatrace-windows-updater-policy-readiness-template.json"
] as const;

function sha256(path: string): string | undefined {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : undefined;
}

function summarizeEvidence(fileName: string): ApprovalEvidence {
  const evidencePath = resolve(releaseDir, fileName);
  const hash = sha256(evidencePath);
  return {
    fileName,
    exists: existsSync(evidencePath),
    ...(hash === undefined ? {} : { sha256: hash }),
    ...(existsSync(evidencePath) ? { sizeBytes: statSync(evidencePath).size } : {}),
    requiredForRc: true
  };
}

function smokeSuitePassed(): boolean {
  const smokeSuitePath = resolve(releaseDir, "lumatrace-windows-packaging-smoke-suite-manifest.json");
  if (!existsSync(smokeSuitePath)) {
    return false;
  }
  const content = JSON.parse(readFileSync(smokeSuitePath, "utf8")) as { status?: unknown };
  return content.status === "success";
}

const template: WindowsReleaseApprovalReadinessTemplate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-release-approval-readiness-template",
  status: "not_granted",
  approvalGranted: false,
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  approval: {
    approverRecorded: false,
    approverRoleRecorded: false,
    approvedAtRecorded: false,
    decision: "pending",
    releaseNotesApproved: false
  },
  requiredEvidence: {
    manualGuiQaPassed: false,
    licenseReviewApproved: false,
    codeSigningVerified: false,
    updaterPolicyConfigured: false,
    sidecarProductionReady: false,
    smokeSuitePassed: smokeSuitePassed()
  },
  evidence: approvalEvidenceFileNames.map((fileName) => summarizeEvidence(fileName)),
  reviewer: {
    name: null,
    completedAt: null,
    decision: "pending"
  },
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    reviewerNotesExcluded: true,
    stackTracesExcluded: true
  },
  completionRules: [
    "Grant release approval only after manual GUI QA passes with sanitized evidence.",
    "Grant release approval only after license review is approved.",
    "Grant release approval only after code signing and signature verification are complete.",
    "Grant release approval only after updater policy is configured or explicitly waived by release owners.",
    "Store human approval metadata in a separate approved release evidence file; do not put reviewer notes or secrets in this template."
  ],
  limitations: [
    "This is a sanitized release approval readiness template, not production approval.",
    "It does not approve a release, sign artifacts, configure an updater, publish artifacts, or upload data.",
    "It does not include reviewer notes, auth tokens, full local paths, raw logs, command lines, raw CSV, or stack traces.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`Windows release approval readiness template written to ${outputPath}`);
console.log(`status=${template.status}`);
console.log(`evidence=${String(template.evidence.length)}`);
