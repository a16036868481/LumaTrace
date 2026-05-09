import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface SigningArtifact {
  fileName: string;
  exists: boolean;
  sha256?: string;
  requiredForRc: true;
}

interface CodeSigningTemplate {
  artifacts: SigningArtifact[];
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
const templatePath = resolve(releaseDir, "lumatrace-windows-code-signing-readiness-template.json");
const resultPath = resolve(releaseDir, "lumatrace-windows-code-signing-readiness-result.json");
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function assertRcGateCodeSigningProgress(): void {
  const text = readFileSync(rcGatePath, "utf8");
  const rcGate = JSON.parse(text) as RcGate;
  const gateById = new Map((rcGate.gates ?? []).map((gate) => [gate.id, gate]));
  const blockerCodes = new Set((rcGate.blockers ?? []).map((blocker) => blocker.code));
  const codeSigningGate = gateById.get("code_signing");

  if (!hasCleanText(text)) {
    fail("RC gate must remain sanitized after code signing result summary");
  }
  if (rcGate.productionReady !== false || rcGate.rcCandidateReady !== false) {
    fail("Code signing progress must not mark the RC or production release ready");
  }
  if (codeSigningGate?.status !== "passed") {
    fail(`Expected code_signing gate to pass, got ${String(codeSigningGate?.status)}`);
  }
  if (codeSigningGate.evidence?.fileName !== "lumatrace-windows-code-signing-readiness-result.json") {
    fail("Code signing passed gate should reference the sanitized code signing readiness result");
  }
  if (blockerCodes.has("CODE_SIGNING")) {
    fail("Code signing blocker should be absent after a validated configured signing result");
  }
  for (const blocker of ["SIDECAR_PRODUCTION_READINESS", "UPDATER_POLICY", "RELEASE_APPROVAL"]) {
    if (!blockerCodes.has(blocker)) {
      fail(`Expected remaining release blocker to stay present: ${blocker}`);
    }
  }
}

try {
  if (!existsSync(templatePath)) {
    runNodeScript("scripts/export-windows-code-signing-readiness-template.ts");
  }

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
      "Synthetic fixture used only to verify RC gate code-signing progress.",
      "This file is removed after the smoke and is not real signing evidence.",
      "productionReady remains false."
    ]
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  runNodeScript("scripts/verify-windows-code-signing-readiness-result.ts", [resultPath]);
  runNodeScript("scripts/export-windows-release-policy-template.ts");
  runNodeScript("scripts/export-windows-packaging-rc-gate.ts");
  assertRcGateCodeSigningProgress();
  runNodeScript("scripts/verify-windows-packaging-rc-gate.ts");
  console.log("Windows packaging RC gate code-signing-result smoke passed");
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
