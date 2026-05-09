import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface UpdaterArtifact {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  requiredForRc: true;
}

interface WindowsUpdaterPolicyReadinessTemplate {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-updater-policy-readiness-template";
  status: "not_configured";
  configured: false;
  productionReady: false;
  unsignedDraft: true;
  updater: {
    configured: false;
    provider: "not_configured";
    endpointRecorded: false;
    channelStrategyConfigured: false;
    autoUpdateEnabled: false;
  };
  updateSigning: {
    configured: false;
    publicKeyRecorded: false;
    privateKeyAvailable: false;
    signingCommandRecorded: false;
  };
  rollback: {
    configured: false;
    rollbackPolicyConfigured: false;
    stagedRolloutConfigured: false;
    rollbackTestRecorded: false;
  };
  verification: {
    configured: false;
    updateManifestVerified: false;
    installerUpdatePathVerified: false;
    signedUpdateVerified: false;
  };
  artifacts: UpdaterArtifact[];
  reviewer: {
    name: null;
    completedAt: null;
    decision: "pending";
  };
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    updateSigningSecretsExcluded: true;
    updaterEndpointSecretsExcluded: true;
    stackTracesExcluded: true;
  };
  completionRules: string[];
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const outputPath = resolve(releaseDir, "lumatrace-windows-updater-policy-readiness-template.json");

const updaterArtifactFileNames = [
  "lumatrace-installer-draft-manifest.json",
  "lumatrace-bundle-draft-manifest.json",
  "lumatrace-windows-packaging-release-readiness.json",
  "lumatrace-windows-packaging-rc-gate.json"
] as const;

function sha256(path: string): string | undefined {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : undefined;
}

function summarizeArtifact(fileName: string): UpdaterArtifact {
  const artifactPath = resolve(releaseDir, fileName);
  const hash = sha256(artifactPath);
  return {
    fileName,
    exists: existsSync(artifactPath),
    ...(hash === undefined ? {} : { sha256: hash }),
    ...(existsSync(artifactPath) ? { sizeBytes: statSync(artifactPath).size } : {}),
    requiredForRc: true
  };
}

const template: WindowsUpdaterPolicyReadinessTemplate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-updater-policy-readiness-template",
  status: "not_configured",
  configured: false,
  productionReady: false,
  unsignedDraft: true,
  updater: {
    configured: false,
    provider: "not_configured",
    endpointRecorded: false,
    channelStrategyConfigured: false,
    autoUpdateEnabled: false
  },
  updateSigning: {
    configured: false,
    publicKeyRecorded: false,
    privateKeyAvailable: false,
    signingCommandRecorded: false
  },
  rollback: {
    configured: false,
    rollbackPolicyConfigured: false,
    stagedRolloutConfigured: false,
    rollbackTestRecorded: false
  },
  verification: {
    configured: false,
    updateManifestVerified: false,
    installerUpdatePathVerified: false,
    signedUpdateVerified: false
  },
  artifacts: updaterArtifactFileNames.map((fileName) => summarizeArtifact(fileName)),
  reviewer: {
    name: null,
    completedAt: null,
    decision: "pending"
  },
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    updateSigningSecretsExcluded: true,
    updaterEndpointSecretsExcluded: true,
    stackTracesExcluded: true
  },
  completionRules: [
    "Choose and document the updater strategy before enabling release updates.",
    "Record update signing public-key metadata in an approved release-only evidence file.",
    "Keep update signing private keys, passwords, endpoints with secrets, and raw commands out of this template.",
    "Define rollback and staged-rollout behavior before considering the updater gate complete.",
    "Verify update manifests and signed update artifacts with sanitized evidence only."
  ],
  limitations: [
    "This is a sanitized updater readiness template, not an updater implementation.",
    "It does not configure Tauri updater, publish update manifests, sign updates, host artifacts, or test rollback.",
    "It does not include endpoint secrets, private keys, command lines, raw logs, full local paths, or tokens.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`Windows updater policy readiness template written to ${outputPath}`);
console.log(`status=${template.status}`);
console.log(`artifacts=${String(template.artifacts.length)}`);
