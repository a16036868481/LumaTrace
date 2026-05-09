import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SigningArtifact {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  requiredForRc?: unknown;
}

interface WindowsCodeSigningReadinessTemplate {
  evidenceKind?: unknown;
  status?: unknown;
  configured?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  certificate?: {
    configured?: unknown;
    subjectNameRecorded?: unknown;
    thumbprintRecorded?: unknown;
    privateKeyAvailable?: unknown;
  };
  timestamping?: {
    configured?: unknown;
    serverUrlRecorded?: unknown;
    digestAlgorithmRecorded?: unknown;
  };
  verification?: {
    configured?: unknown;
    verifyCommandRecorded?: unknown;
    signatureVerified?: unknown;
    signedArtifactCount?: unknown;
  };
  artifacts?: SigningArtifact[];
  reviewer?: {
    name?: unknown;
    completedAt?: unknown;
    decision?: unknown;
  };
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    certificateSecretsExcluded?: unknown;
    signingCommandSecretsExcluded?: unknown;
    stackTracesExcluded?: unknown;
  };
}

const templatePath = resolve(
  "apps/desktop/src-tauri/target/release/lumatrace-windows-code-signing-readiness-template.json"
);

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function clean(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|privateKeyPath)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"configured"\s*:\s*true/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows code signing readiness template exists", existsSync(templatePath));
if (!existsSync(templatePath)) {
  process.exit(1);
}

const text = readFileSync(templatePath, "utf8");
const template = JSON.parse(text) as WindowsCodeSigningReadinessTemplate;
const artifacts = template.artifacts ?? [];

check("code signing template is sanitized", clean(text));
check("evidence kind is windows-code-signing-readiness-template", template.evidenceKind === "windows-code-signing-readiness-template");
check("template status remains not_configured", template.status === "not_configured");
check("configured remains false", template.configured === false);
check("productionReady remains false", template.productionReady === false);
check("unsigned draft remains true", template.unsignedDraft === true);
check("certificate is not configured", template.certificate?.configured === false);
check("certificate subject is not recorded", template.certificate?.subjectNameRecorded === false);
check("certificate thumbprint is not recorded", template.certificate?.thumbprintRecorded === false);
check("private key is not available", template.certificate?.privateKeyAvailable === false);
check("timestamping is not configured", template.timestamping?.configured === false);
check("timestamp server is not recorded", template.timestamping?.serverUrlRecorded === false);
check("digest algorithm is not recorded", template.timestamping?.digestAlgorithmRecorded === false);
check("signature verification is not configured", template.verification?.configured === false);
check("verify command is not recorded", template.verification?.verifyCommandRecorded === false);
check("signature is not verified", template.verification?.signatureVerified === false);
check("signed artifact count remains zero", template.verification?.signedArtifactCount === 0);
check("signing artifacts are present", artifacts.length >= 3);
check("desktop executable artifact is represented", artifacts.some((artifact) => artifact.fileName === "lumatrace-desktop.exe"));
check("sidecar executable artifact is represented", artifacts.some((artifact) => artifact.fileName === "lumatrace-local-server.exe"));
check("artifacts use relative file names", artifacts.every((artifact) => typeof artifact.fileName === "string" && !/[\\/]/u.test(artifact.fileName)));
check("all artifacts are RC-required", artifacts.every((artifact) => artifact.requiredForRc === true));
check("existing artifacts have hashes", artifacts.filter((artifact) => artifact.exists === true).every((artifact) => typeof artifact.sha256 === "string"));
check("reviewer name starts empty", template.reviewer?.name === null);
check("reviewer completedAt starts empty", template.reviewer?.completedAt === null);
check("reviewer decision starts pending", template.reviewer?.decision === "pending");
check("token redaction asserted", template.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", template.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", template.securityAssertions?.rawLogsExcluded === true);
check("certificate secrets excluded", template.securityAssertions?.certificateSecretsExcluded === true);
check("signing command secrets excluded", template.securityAssertions?.signingCommandSecretsExcluded === true);
check("stack traces excluded", template.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows code signing readiness template verification failed");
  process.exit(1);
}

console.log("Windows code signing readiness template verification passed");
