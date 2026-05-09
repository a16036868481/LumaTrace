import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface SidecarEvidence {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
}

interface SidecarReadinessTemplate {
  sidecar: Record<string, unknown>;
  checks: Record<string, unknown>;
  evidence: SidecarEvidence[];
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
const templatePath = resolve(releaseDir, "lumatrace-windows-sidecar-production-readiness-template.json");
const resultPath = resolve(releaseDir, "lumatrace-windows-sidecar-production-readiness-result.json");
const rcGatePath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");
const previousResult = existsSync(resultPath) ? readFileSync(resultPath, "utf8") : undefined;
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function assertRcGateSidecarProgress(): void {
  const text = readFileSync(rcGatePath, "utf8");
  const rcGate = JSON.parse(text) as RcGate;
  const gateById = new Map((rcGate.gates ?? []).map((gate) => [gate.id, gate]));
  const blockerCodes = new Set((rcGate.blockers ?? []).map((blocker) => blocker.code));
  const sidecarGate = gateById.get("sidecar_production_readiness");

  if (!hasCleanText(text)) {
    fail("RC gate must remain sanitized after sidecar readiness result summary");
  }
  if (rcGate.productionReady !== false || rcGate.rcCandidateReady !== false) {
    fail("Sidecar readiness progress must not mark the RC or production release ready");
  }
  if (sidecarGate?.status !== "passed") {
    fail(`Expected sidecar_production_readiness gate to pass, got ${String(sidecarGate?.status)}`);
  }
  if (sidecarGate.evidence?.fileName !== "lumatrace-windows-sidecar-production-readiness-result.json") {
    fail("Sidecar readiness passed gate should reference the sanitized sidecar readiness result");
  }
  if (blockerCodes.has("SIDECAR_PRODUCTION_READINESS")) {
    fail("Sidecar production readiness blocker should be absent after a validated sidecar readiness result");
  }
  for (const blocker of ["LICENSE_NOTICE_REVIEW", "CODE_SIGNING", "UPDATER_POLICY", "RELEASE_APPROVAL"]) {
    if (!blockerCodes.has(blocker)) {
      fail(`Expected remaining release blocker to stay present: ${blocker}`);
    }
  }
}

try {
  if (!existsSync(templatePath)) {
    runNodeScript("scripts/export-windows-sidecar-production-readiness-template.ts");
  }

  const template = JSON.parse(readFileSync(templatePath, "utf8")) as SidecarReadinessTemplate;
  const result = {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-sidecar-production-readiness-result",
    status: "approved",
    approved: true,
    productionReady: false,
    unsignedDraft: true,
    sidecar: {
      ...template.sidecar,
      artifactKind: "self-contained",
      nodeRequired: false,
      manifestProductionReady: false
    },
    checks: {
      ...template.checks,
      selfContainedDraftPresent: true,
      bundledRuntimeRecorded: true,
      nodeRequiredFalse: true,
      releaseSidecarSmokePassed: true,
      sidecarAuthTransportSmokePassed: true,
      installedSidecarHealthSmokePassed: true,
      publicSidecarListenersAllowed: false,
      licenseReviewApproved: false
    },
    evidence: template.evidence.map((item) => ({
      ...item,
      reviewed: item.exists,
      reviewSummary: item.exists
        ? "Synthetic fixture sidecar readiness review summary."
        : "Evidence absent in this draft fixture."
    })),
    reviewer: {
      name: "Sidecar Readiness Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify RC gate sidecar-readiness progress.",
      "This file is removed after the smoke and is not real sidecar production approval.",
      "It does not approve license review, signing, updater policy, release approval, or productionReady=true."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  runNodeScript("scripts/verify-windows-sidecar-production-readiness-result.ts", [resultPath]);
  runNodeScript("scripts/export-windows-packaging-rc-gate.ts");
  assertRcGateSidecarProgress();
  runNodeScript("scripts/verify-windows-packaging-rc-gate.ts");
  console.log("Windows packaging RC gate sidecar-readiness-result smoke passed");
} finally {
  if (previousResult === undefined) {
    rmSync(resultPath, { force: true });
  } else {
    writeFileSync(resultPath, previousResult, "utf8");
  }

  if (previousRcGate === undefined) {
    rmSync(rcGatePath, { force: true });
  } else {
    writeFileSync(rcGatePath, previousRcGate, "utf8");
  }
}
