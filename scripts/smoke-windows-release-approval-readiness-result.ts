import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface ApprovalEvidence {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  requiredForRc: true;
}

interface ReleaseApprovalTemplate {
  evidence: ApprovalEvidence[];
  securityAssertions: Record<string, unknown>;
}

const root = process.cwd();
const templatePath = resolve(
  root,
  "apps/desktop/src-tauri/target/release/lumatrace-windows-release-approval-readiness-template.json"
);
const smokeTempDir = mkdtempSync(join(tmpdir(), "lumatrace-release-approval-result-"));
const resultPath = join(smokeTempDir, "lumatrace-windows-release-approval-readiness-result.json");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  const template = JSON.parse(readFileSync(templatePath, "utf8")) as ReleaseApprovalTemplate;
  const result = {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-release-approval-readiness-result",
    status: "approved",
    approvalGranted: true,
    rcCandidateReady: false,
    productionReady: false,
    unsignedDraft: true,
    approval: {
      approverRecorded: true,
      approverRoleRecorded: true,
      approvedAtRecorded: true,
      decision: "approved",
      releaseNotesApproved: true,
      approverNameSanitized: "Release approver summary",
      approverRoleSanitized: "Release owner"
    },
    requiredEvidence: {
      manualGuiQaPassed: true,
      licenseReviewApproved: true,
      codeSigningVerified: true,
      updaterPolicyConfigured: true,
      sidecarProductionReady: true,
      smokeSuitePassed: true
    },
    evidence: template.evidence.map((item) => ({
      ...item,
      reviewed: item.exists,
      reviewSummary: item.exists
        ? "Synthetic fixture release approval evidence review summary."
        : "Evidence absent in this draft fixture."
    })),
    reviewer: {
      name: "Release Approval Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify release approval result schema and RC gate progression.",
      "This file is removed after the smoke and is not real release approval.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const verification = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/verify-windows-release-approval-readiness-result.ts",
      resultPath
    ],
    { cwd: root, encoding: "utf8" }
  );

  if (verification.stdout.trim().length > 0) {
    console.log(verification.stdout.trim());
  }
  if (verification.stderr.trim().length > 0) {
    console.error(verification.stderr.trim());
  }
  if (verification.status !== 0) {
    fail(
      `Release approval readiness result verifier smoke failed with exit code ${String(verification.status)}`
    );
  }

  console.log("Windows release approval readiness result verifier smoke passed");
} finally {
  rmSync(smokeTempDir, { recursive: true, force: true });
}
