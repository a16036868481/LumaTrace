import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

const root = process.cwd();
const templatePath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-sidecar-production-readiness-template.json");
const smokeTempDir = mkdtempSync(join(tmpdir(), "lumatrace-sidecar-readiness-result-"));
const resultPath = join(smokeTempDir, "lumatrace-windows-sidecar-production-readiness-result.json");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
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
      "Synthetic fixture used only to verify sidecar production readiness result schema and RC gate progression.",
      "This file is removed after the smoke and is not real sidecar production approval.",
      "It does not approve license review, signing, updater policy, release approval, or productionReady=true."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const verification = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/verify-windows-sidecar-production-readiness-result.ts", resultPath],
    { cwd: root, encoding: "utf8" }
  );

  if (verification.stdout.trim().length > 0) {
    console.log(verification.stdout.trim());
  }
  if (verification.stderr.trim().length > 0) {
    console.error(verification.stderr.trim());
  }
  if (verification.status !== 0) {
    fail(`Sidecar production readiness result verifier smoke failed with exit code ${String(verification.status)}`);
  }

  console.log("Windows sidecar production readiness result verifier smoke passed");
} finally {
  rmSync(smokeTempDir, { recursive: true, force: true });
}
