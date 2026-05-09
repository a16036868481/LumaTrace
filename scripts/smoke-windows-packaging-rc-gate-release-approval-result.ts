import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface ApprovalEvidence {
  fileName: string;
  exists: boolean;
  sha256?: string;
  requiredForRc: true;
}

interface ReleaseApprovalTemplate {
  evidence: ApprovalEvidence[];
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
  policy?: {
    productionApprovalGranted?: boolean;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const templatePath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-template.json"
);
const resultPath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-result.json"
);
const releasePolicyPath = resolve(releaseDir, "lumatrace-windows-release-policy-template.json");
const rcGatePath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");
const previousResult = existsSync(resultPath) ? readFileSync(resultPath, "utf8") : undefined;
const previousReleasePolicy = existsSync(releasePolicyPath)
  ? readFileSync(releasePolicyPath, "utf8")
  : undefined;
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function assertRcGateReleaseApprovalProgress(): void {
  const text = readFileSync(rcGatePath, "utf8");
  const rcGate = JSON.parse(text) as RcGate;
  const gateById = new Map((rcGate.gates ?? []).map((gate) => [gate.id, gate]));
  const blockerCodes = new Set((rcGate.blockers ?? []).map((blocker) => blocker.code));
  const releaseGate = gateById.get("release_approval");

  if (!hasCleanText(text)) {
    fail("RC gate must remain sanitized after release approval result summary");
  }
  if (rcGate.productionReady !== false || rcGate.rcCandidateReady !== false) {
    fail("Release approval progress must not mark the RC or production release ready");
  }
  if (rcGate.policy?.productionApprovalGranted !== true) {
    fail(
      "RC gate policy should record productionApprovalGranted=true only after a validated release approval result"
    );
  }
  if (releaseGate?.status !== "passed") {
    fail(`Expected release_approval gate to pass, got ${String(releaseGate?.status)}`);
  }
  if (
    releaseGate.evidence?.fileName !== "lumatrace-windows-release-approval-readiness-result.json"
  ) {
    fail(
      "Release approval passed gate should reference the sanitized release approval readiness result"
    );
  }
  if (blockerCodes.has("RELEASE_APPROVAL")) {
    fail("Release approval blocker should be absent after a validated release approval result");
  }
  for (const blocker of [
    "SIDECAR_PRODUCTION_READINESS",
    "LICENSE_NOTICE_REVIEW",
    "CODE_SIGNING",
    "UPDATER_POLICY"
  ]) {
    if (!blockerCodes.has(blocker)) {
      fail(`Expected remaining release blocker to stay present: ${blocker}`);
    }
  }
}

try {
  if (!existsSync(templatePath)) {
    runNodeScript("scripts/export-windows-release-approval-readiness-template.ts");
  }

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
      "Synthetic fixture used only to verify RC gate release-approval progress.",
      "This file is removed after the smoke and is not real release approval.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  runNodeScript("scripts/verify-windows-release-approval-readiness-result.ts", [resultPath]);
  runNodeScript("scripts/export-windows-release-policy-template.ts");
  runNodeScript("scripts/export-windows-packaging-rc-gate.ts");
  assertRcGateReleaseApprovalProgress();
  runNodeScript("scripts/verify-windows-packaging-rc-gate.ts");
  console.log("Windows packaging RC gate release-approval-result smoke passed");
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
