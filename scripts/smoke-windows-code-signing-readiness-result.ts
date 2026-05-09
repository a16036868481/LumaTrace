import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface SigningArtifact {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  requiredForRc: true;
}

interface CodeSigningTemplate {
  artifacts: SigningArtifact[];
  securityAssertions: Record<string, unknown>;
}

const root = process.cwd();
const templatePath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-code-signing-readiness-template.json");
const smokeTempDir = mkdtempSync(join(tmpdir(), "lumatrace-code-signing-result-"));
const resultPath = join(smokeTempDir, "lumatrace-windows-code-signing-readiness-result.json");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  const template = JSON.parse(readFileSync(templatePath, "utf8")) as CodeSigningTemplate;
  const signedArtifacts = template.artifacts.filter((artifact) => artifact.exists);
  const result = {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-code-signing-readiness-result",
    status: "configured_verified",
    configured: true,
    productionReady: false,
    unsignedDraft: true,
    certificate: {
      configured: true,
      subjectNameRecorded: true,
      thumbprintRecorded: true,
      privateKeyAvailable: false,
      storage: "external-release-signing-store",
      subjectNameSanitized: "LumaTrace release signing certificate summary",
      thumbprintSha256: "0".repeat(64)
    },
    timestamping: {
      configured: true,
      serverUrlRecorded: true,
      digestAlgorithmRecorded: true,
      serverNameSanitized: "trusted timestamp authority summary",
      digestAlgorithm: "sha256"
    },
    verification: {
      configured: true,
      verifyCommandRecorded: false,
      signatureVerified: true,
      signedArtifactCount: signedArtifacts.length
    },
    artifacts: template.artifacts.map((artifact) => ({
      ...artifact,
      signatureVerified: artifact.exists,
      signedSha256: artifact.sha256,
      verificationSummary: artifact.exists
        ? "Synthetic fixture signature verification summary."
        : "Artifact absent in this draft fixture."
    })),
    reviewer: {
      name: "Signing Fixture Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "configured_verified"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify code signing readiness result schema and RC gate progression.",
      "This file is removed after the smoke and is not real signing evidence.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const verification = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/verify-windows-code-signing-readiness-result.ts", resultPath],
    { cwd: root, encoding: "utf8" }
  );

  if (verification.stdout.trim().length > 0) {
    console.log(verification.stdout.trim());
  }
  if (verification.stderr.trim().length > 0) {
    console.error(verification.stderr.trim());
  }
  if (verification.status !== 0) {
    fail(`Code signing readiness result verifier smoke failed with exit code ${String(verification.status)}`);
  }

  console.log("Windows code signing readiness result verifier smoke passed");
} finally {
  rmSync(smokeTempDir, { recursive: true, force: true });
}
