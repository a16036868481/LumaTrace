import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface SigningArtifact {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  requiredForRc: true;
}

interface WindowsCodeSigningReadinessTemplate {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-code-signing-readiness-template";
  status: "not_configured";
  configured: false;
  productionReady: false;
  unsignedDraft: true;
  certificate: {
    configured: false;
    subjectNameRecorded: false;
    thumbprintRecorded: false;
    privateKeyAvailable: false;
    storage: "not_configured";
  };
  timestamping: {
    configured: false;
    serverUrlRecorded: false;
    digestAlgorithmRecorded: false;
  };
  verification: {
    configured: false;
    verifyCommandRecorded: false;
    signatureVerified: false;
    signedArtifactCount: 0;
  };
  artifacts: SigningArtifact[];
  reviewer: {
    name: null;
    completedAt: null;
    decision: "pending";
  };
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    certificateSecretsExcluded: true;
    signingCommandSecretsExcluded: true;
    stackTracesExcluded: true;
  };
  completionRules: string[];
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const outputPath = resolve(releaseDir, "lumatrace-windows-code-signing-readiness-template.json");

const signingArtifactFileNames = [
  "lumatrace-desktop.exe",
  "lumatrace-local-server.exe",
  "lumatrace-installer-draft-manifest.json",
  "lumatrace-bundle-draft-manifest.json"
] as const;

function sha256(path: string): string | undefined {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : undefined;
}

function summarizeArtifact(fileName: string): SigningArtifact {
  const artifactPath = resolve(releaseDir, fileName);
  return {
    fileName,
    exists: existsSync(artifactPath),
    ...(sha256(artifactPath) === undefined ? {} : { sha256: sha256(artifactPath) }),
    ...(existsSync(artifactPath) ? { sizeBytes: statSync(artifactPath).size } : {}),
    requiredForRc: true
  };
}

const template: WindowsCodeSigningReadinessTemplate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-code-signing-readiness-template",
  status: "not_configured",
  configured: false,
  productionReady: false,
  unsignedDraft: true,
  certificate: {
    configured: false,
    subjectNameRecorded: false,
    thumbprintRecorded: false,
    privateKeyAvailable: false,
    storage: "not_configured"
  },
  timestamping: {
    configured: false,
    serverUrlRecorded: false,
    digestAlgorithmRecorded: false
  },
  verification: {
    configured: false,
    verifyCommandRecorded: false,
    signatureVerified: false,
    signedArtifactCount: 0
  },
  artifacts: signingArtifactFileNames.map((fileName) => summarizeArtifact(fileName)),
  reviewer: {
    name: null,
    completedAt: null,
    decision: "pending"
  },
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    certificateSecretsExcluded: true,
    signingCommandSecretsExcluded: true,
    stackTracesExcluded: true
  },
  completionRules: [
    "Record the production signing certificate subject and thumbprint in an approved release-only evidence file.",
    "Record the timestamp server and digest algorithm before signing release artifacts.",
    "Sign the release executable, sidecar, and installer artifacts outside this draft template.",
    "Verify signatures with Windows tooling and store only sanitized verification summaries.",
    "This template never stores certificate files, private keys, passwords, raw signing commands, or auth tokens."
  ],
  limitations: [
    "This is a sanitized code signing readiness template, not a signing action.",
    "It does not invoke signtool, configure a certificate, timestamp binaries, or verify signatures.",
    "It does not include certificate secrets, private key paths, command lines, raw logs, or full local paths.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`Windows code signing readiness template written to ${outputPath}`);
console.log(`status=${template.status}`);
console.log(`artifacts=${String(template.artifacts.length)}`);
