import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface LicenseReviewItem {
  name: string;
  version?: string;
  license: string;
  needsHumanReview: boolean;
}

interface LicenseReviewTemplate {
  sourceNotices: Record<string, unknown>;
  reviewer: Record<string, unknown>;
  summary: Record<string, unknown>;
  reviewItems: LicenseReviewItem[];
  securityAssertions: Record<string, unknown>;
}

interface RcGate {
  productionReady?: boolean;
  rcCandidateReady?: boolean;
  gates?: Array<{
    id?: string;
    status?: string;
    evidence?: {
      fileName?: string;
    };
  }>;
  blockers?: Array<{
    code?: string;
  }>;
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const templatePath = resolve(releaseDir, "lumatrace-windows-license-review-template.json");
const resultPath = resolve(releaseDir, "lumatrace-windows-license-review-result.json");
const releasePolicyPath = resolve(releaseDir, "lumatrace-windows-release-policy-template.json");
const rcGatePath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");
const previousResult = existsSync(resultPath) ? readFileSync(resultPath, "utf8") : undefined;
const previousReleasePolicy = existsSync(releasePolicyPath) ? readFileSync(releasePolicyPath, "utf8") : undefined;
const previousRcGate = existsSync(rcGatePath) ? readFileSync(rcGatePath, "utf8") : undefined;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runNodeScript(scriptPath: string, args: string[] = []): void {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim().length > 0) {
    console.error(result.stderr.trim());
  }
  if (result.status !== 0) {
    fail(`${scriptPath} failed with exit code ${String(result.status)}`);
  }
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function assertRcGateLicenseReviewProgress(): void {
  const text = readFileSync(rcGatePath, "utf8");
  const rcGate = JSON.parse(text) as RcGate;
  const gateById = new Map((rcGate.gates ?? []).map((gate) => [gate.id, gate]));
  const blockerCodes = new Set((rcGate.blockers ?? []).map((blocker) => blocker.code));
  const licenseGate = gateById.get("license_notice_review");

  if (!hasCleanText(text)) {
    fail("RC gate must remain sanitized after license review result summary");
  }
  if (rcGate.productionReady !== false || rcGate.rcCandidateReady !== false) {
    fail("License review progress must not mark the RC or production release ready");
  }
  if (licenseGate?.status !== "passed") {
    fail(`Expected license_notice_review gate to pass, got ${String(licenseGate?.status)}`);
  }
  if (licenseGate.evidence?.fileName !== "lumatrace-windows-license-review-result.json") {
    fail("License review passed gate should reference the sanitized license review result");
  }
  if (blockerCodes.has("LICENSE_NOTICE_REVIEW")) {
    fail("License review blocker should be absent after a validated approved license review result");
  }
  for (const blocker of ["SIDECAR_PRODUCTION_READINESS", "CODE_SIGNING", "UPDATER_POLICY", "RELEASE_APPROVAL"]) {
    if (!blockerCodes.has(blocker)) {
      fail(`Expected remaining release blocker to stay present: ${blocker}`);
    }
  }
}

try {
  if (!existsSync(templatePath)) {
    runNodeScript("scripts/export-windows-license-review-template.ts");
  }

  const template = JSON.parse(readFileSync(templatePath, "utf8")) as LicenseReviewTemplate;
  const result = {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-license-review-result",
    status: "approved",
    approved: true,
    productionReady: false,
    unsignedDraft: true,
    sourceNotices: template.sourceNotices,
    reviewer: {
      name: "License Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    summary: template.summary,
    reviewItems: template.reviewItems.map((item) => ({
      ...item,
      reviewDecision: "approved",
      resolution:
        item.license === "UNKNOWN"
          ? "Synthetic fixture resolution: private LumaTrace workspace package classified for draft review."
          : "Synthetic fixture resolution: generated notice metadata reviewed for draft smoke.",
      reviewerNote: item.needsHumanReview
        ? "Synthetic fixture reviewer note for license review RC gate smoke."
        : "Synthetic fixture confirms recorded notice metadata."
    })),
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify RC gate license-review progress.",
      "This file is removed after the smoke and is not real release approval.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  runNodeScript("scripts/verify-windows-license-review-result.ts", [resultPath]);
  runNodeScript("scripts/export-windows-release-policy-template.ts");
  runNodeScript("scripts/export-windows-packaging-rc-gate.ts");
  assertRcGateLicenseReviewProgress();
  runNodeScript("scripts/verify-windows-packaging-rc-gate.ts");
  console.log("Windows packaging RC gate license-review-result smoke passed");
} finally {
  if (previousResult === undefined) {
    rmSync(resultPath, { force: true });
  } else {
    writeFileSync(resultPath, previousResult, "utf8");
  }

  if (previousReleasePolicy === undefined) {
    rmSync(releasePolicyPath, { force: true });
  } else {
    writeFileSync(releasePolicyPath, previousReleasePolicy, "utf8");
  }

  if (previousRcGate === undefined) {
    rmSync(rcGatePath, { force: true });
  } else {
    writeFileSync(rcGatePath, previousRcGate, "utf8");
  }
}
