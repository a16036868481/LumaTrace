import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface LicenseReviewItem {
  name: string;
  version?: string;
  componentType?: string;
  license: string;
  licenseSource?: string;
  noticeFileNames: string[];
  reviewStatus: string;
  privatePackage: boolean;
  needsHumanReview: boolean;
}

interface WindowsLicenseReviewTemplate {
  schemaVersion: 1;
  evidenceKind: "windows-license-review-template";
  status: "draft_requires_review";
  approved: false;
  productionReady: false;
  unsignedDraft: true;
  sourceNotices: {
    packagingNoticesFile: "packaging-notices.json";
    packagingNoticesSha256?: string;
    packagingNoticesSizeBytes?: number;
    thirdPartyNoticesFile: "THIRD-PARTY-NOTICES.md";
    thirdPartyNoticesSha256?: string;
    thirdPartyNoticesSizeBytes?: number;
  };
  reviewer: {
    name: null | string;
    completedAt: null | string;
    decision: "pending" | "approved";
  };
  summary: {
    totalComponents: number;
    runtimeCount: number;
    packageCount: number;
    privatePackageCount: number;
    missingLicenseCount: number;
    reviewRequiredCount: number;
  };
  reviewItems: LicenseReviewItem[];
  completionRules: string[];
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    rawLicenseTextExcluded: true;
    stackTracesExcluded: true;
  };
  limitations: string[];
}

const root = process.cwd();
const templatePath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-license-review-template.json");
const smokeTempDir = mkdtempSync(join(tmpdir(), "lumatrace-license-review-result-"));
const resultPath = join(smokeTempDir, "lumatrace-windows-license-review-result.json");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  const template = JSON.parse(readFileSync(templatePath, "utf8")) as WindowsLicenseReviewTemplate;
  const result = {
    ...template,
    evidenceKind: "windows-license-review-result",
    status: "approved",
    approved: true,
    productionReady: false,
    unsignedDraft: true,
    reviewer: {
      name: "License Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    reviewItems: template.reviewItems.map((item) => ({
      ...item,
      reviewDecision: "approved",
      resolution:
        item.license === "UNKNOWN"
          ? "Synthetic fixture resolution: private LumaTrace workspace package classified for draft review."
          : "Synthetic fixture resolution: generated notice metadata reviewed for draft smoke.",
      reviewerNote: item.needsHumanReview
        ? "Synthetic fixture reviewer note for license review result smoke."
        : "Synthetic fixture confirms recorded notice metadata."
    })),
    limitations: [
      "Synthetic fixture used only to verify license review result schema and RC gate progression.",
      "This file is removed after the smoke and is not real release approval.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const verification = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/verify-windows-license-review-result.ts", resultPath],
    { cwd: root, encoding: "utf8" }
  );

  if (verification.stdout.trim().length > 0) {
    console.log(verification.stdout.trim());
  }
  if (verification.stderr.trim().length > 0) {
    console.error(verification.stderr.trim());
  }
  if (verification.status !== 0) {
    fail(`License review result verifier smoke failed with exit code ${String(verification.status)}`);
  }

  console.log("Windows license review result verifier smoke passed");
} finally {
  rmSync(smokeTempDir, { recursive: true, force: true });
}
