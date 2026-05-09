import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

interface SigningArtifact {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  requiredForRc?: unknown;
  signatureVerified?: unknown;
  signedSha256?: unknown;
  verificationSummary?: unknown;
}

interface WindowsCodeSigningReadinessDocument {
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
    storage?: unknown;
    subjectNameSanitized?: unknown;
    thumbprintSha256?: unknown;
  };
  timestamping?: {
    configured?: unknown;
    serverUrlRecorded?: unknown;
    digestAlgorithmRecorded?: unknown;
    serverNameSanitized?: unknown;
    digestAlgorithm?: unknown;
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

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const defaultResultPath = resolve(releaseDir, "lumatrace-windows-code-signing-readiness-result.json");
const templatePath = resolve(releaseDir, "lumatrace-windows-code-signing-readiness-template.json");
const resultPathArg = process.argv[2];
const resultPath =
  resultPathArg === undefined
    ? defaultResultPath
    : isAbsolute(resultPathArg)
      ? resultPathArg
      : resolve(root, resultPathArg);

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/LUMATRACE_AUTH_TOKEN\s*=\s*[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/"(?:authToken|token|secret|password|privateKeyPath|certificatePath)"\s*:\s*"[^"]{3,}"/iu.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|signingCommand)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function readJson(path: string): WindowsCodeSigningReadinessDocument {
  return JSON.parse(readFileSync(path, "utf8")) as WindowsCodeSigningReadinessDocument;
}

check("code signing readiness template exists", existsSync(templatePath));
check("code signing readiness result exists", existsSync(resultPath));

if (!existsSync(templatePath) || !existsSync(resultPath)) {
  console.error(
    "Run pnpm verify:windows-code-signing-readiness-template first, then pass a filled result JSON path to this verifier."
  );
  process.exit(1);
}

const template = readJson(templatePath);
const resultText = readFileSync(resultPath, "utf8");
const result = readJson(resultPath);
const templateArtifacts = template.artifacts ?? [];
const resultArtifacts = result.artifacts ?? [];
const templateFileNames = templateArtifacts
  .map((artifact) => artifact.fileName)
  .filter((fileName): fileName is string => typeof fileName === "string");
const resultFileNames = resultArtifacts
  .map((artifact) => artifact.fileName)
  .filter((fileName): fileName is string => typeof fileName === "string");
const resultFileNameSet = new Set(resultFileNames);
const existingTemplateArtifacts = templateArtifacts.filter((artifact) => artifact.exists === true);
const requiredSignedArtifacts = resultArtifacts.filter((artifact) => artifact.exists === true && artifact.requiredForRc === true);

check("code signing readiness result is sanitized", hasCleanText(resultText));
check("result evidence kind is windows-code-signing-readiness-result", result.evidenceKind === "windows-code-signing-readiness-result");
check("result status is configured_verified", result.status === "configured_verified");
check("configured flag is true", result.configured === true);
check("productionReady remains false", result.productionReady === false);
check("unsigned draft remains explicit", result.unsignedDraft === true);
check("certificate is configured", result.certificate?.configured === true);
check("certificate subject is recorded as sanitized summary", result.certificate?.subjectNameRecorded === true);
check("certificate thumbprint is recorded as hash", result.certificate?.thumbprintRecorded === true);
check("private key is not exported", result.certificate?.privateKeyAvailable === false);
check("certificate storage is sanitized", isNonEmptyString(result.certificate?.storage));
check("certificate subject summary is present", isNonEmptyString(result.certificate?.subjectNameSanitized));
check("certificate thumbprint hash is present", isNonEmptyString(result.certificate?.thumbprintSha256));
check("timestamping is configured", result.timestamping?.configured === true);
check("timestamp server is recorded as sanitized summary", result.timestamping?.serverUrlRecorded === true);
check("digest algorithm is recorded", result.timestamping?.digestAlgorithmRecorded === true);
check("timestamp server summary is present", isNonEmptyString(result.timestamping?.serverNameSanitized));
check("digest algorithm summary is present", isNonEmptyString(result.timestamping?.digestAlgorithm));
check("verification is configured", result.verification?.configured === true);
check("verify command is not copied", result.verification?.verifyCommandRecorded === false);
check("signature verification passed", result.verification?.signatureVerified === true);
check("result has same artifact count as template", resultArtifacts.length === templateArtifacts.length);
check("result artifact file names are unique", resultFileNameSet.size === resultArtifacts.length);
check("result contains every template artifact", templateFileNames.every((fileName) => resultFileNameSet.has(fileName)));
check(
  "signed artifact count covers existing RC artifacts",
  typeof result.verification?.signedArtifactCount === "number" &&
    result.verification.signedArtifactCount >= existingTemplateArtifacts.length
);
check("all existing RC artifacts are signature verified", requiredSignedArtifacts.every((artifact) => artifact.signatureVerified === true));
check(
  "all existing RC artifacts retain original hashes",
  existingTemplateArtifacts.every((templateArtifact) =>
    resultArtifacts.some(
      (artifact) =>
        artifact.fileName === templateArtifact.fileName &&
        artifact.sha256 === templateArtifact.sha256 &&
        artifact.signatureVerified === true
    )
  )
);
check(
  "signed artifact summaries do not use paths",
  resultArtifacts.every((artifact) => typeof artifact.fileName === "string" && !/[\\/]/u.test(artifact.fileName))
);
check("reviewer name is filled", isNonEmptyString(result.reviewer?.name));
check("reviewer completedAt is filled", isNonEmptyString(result.reviewer?.completedAt));
check("reviewer decision is configured_verified", result.reviewer?.decision === "configured_verified");
check("token redaction asserted", result.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", result.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", result.securityAssertions?.rawLogsExcluded === true);
check("certificate secrets excluded", result.securityAssertions?.certificateSecretsExcluded === true);
check("signing command secrets excluded", result.securityAssertions?.signingCommandSecretsExcluded === true);
check("stack traces excluded", result.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows code signing readiness result verification failed");
  process.exit(1);
}

console.log("Windows code signing readiness result verification passed");
