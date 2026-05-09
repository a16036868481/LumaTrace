import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface UpdaterArtifact {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  requiredForRc: true;
}

interface UpdaterPolicyTemplate {
  artifacts: UpdaterArtifact[];
  securityAssertions: Record<string, unknown>;
}

const root = process.cwd();
const templatePath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-updater-policy-readiness-template.json");
const smokeTempDir = mkdtempSync(join(tmpdir(), "lumatrace-updater-policy-result-"));
const resultPath = join(smokeTempDir, "lumatrace-windows-updater-policy-readiness-result.json");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  const template = JSON.parse(readFileSync(templatePath, "utf8")) as UpdaterPolicyTemplate;
  const result = {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-updater-policy-readiness-result",
    status: "policy_decided",
    configured: true,
    productionReady: false,
    unsignedDraft: true,
    updater: {
      configured: true,
      provider: "disabled_for_initial_release",
      endpointRecorded: true,
      endpointSummarySanitized: "No update endpoint is enabled for the initial unsigned QA release.",
      channelStrategyConfigured: true,
      channelStrategy: "Manual distribution only until signing and update hosting are approved.",
      autoUpdateEnabled: false
    },
    updateSigning: {
      configured: true,
      publicKeyRecorded: false,
      privateKeyAvailable: false,
      signingCommandRecorded: false,
      signingPolicy: "Update signing is deferred because automatic updates are disabled for this release."
    },
    rollback: {
      configured: true,
      rollbackPolicyConfigured: true,
      stagedRolloutConfigured: true,
      rollbackTestRecorded: true,
      rollbackPolicySummary: "Rollback is handled by reinstalling the previous manually distributed build."
    },
    verification: {
      configured: true,
      updateManifestVerified: true,
      installerUpdatePathVerified: true,
      signedUpdateVerified: true,
      policyReviewPassed: true
    },
    artifacts: template.artifacts.map((artifact) => ({
      ...artifact,
      policyReviewed: artifact.exists,
      verificationSummary: artifact.exists
        ? "Synthetic fixture policy review summary."
        : "Artifact absent in this draft fixture."
    })),
    reviewer: {
      name: "Updater Policy Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "policy_decided"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify updater policy readiness result schema and RC gate progression.",
      "This file is removed after the smoke and is not real updater evidence.",
      "No updater is implemented or enabled by this fixture.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const verification = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/verify-windows-updater-policy-readiness-result.ts", resultPath],
    { cwd: root, encoding: "utf8" }
  );

  if (verification.stdout.trim().length > 0) {
    console.log(verification.stdout.trim());
  }
  if (verification.stderr.trim().length > 0) {
    console.error(verification.stderr.trim());
  }
  if (verification.status !== 0) {
    fail(`Updater policy readiness result verifier smoke failed with exit code ${String(verification.status)}`);
  }

  console.log("Windows updater policy readiness result verifier smoke passed");
} finally {
  rmSync(smokeTempDir, { recursive: true, force: true });
}
