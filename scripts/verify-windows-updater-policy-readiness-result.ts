import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

interface UpdaterArtifact {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  requiredForRc?: unknown;
  policyReviewed?: unknown;
  verificationSummary?: unknown;
}

interface WindowsUpdaterPolicyReadinessDocument {
  evidenceKind?: unknown;
  status?: unknown;
  configured?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  updater?: {
    configured?: unknown;
    provider?: unknown;
    endpointRecorded?: unknown;
    endpointSummarySanitized?: unknown;
    channelStrategyConfigured?: unknown;
    channelStrategy?: unknown;
    autoUpdateEnabled?: unknown;
  };
  updateSigning?: {
    configured?: unknown;
    publicKeyRecorded?: unknown;
    privateKeyAvailable?: unknown;
    signingCommandRecorded?: unknown;
    signingPolicy?: unknown;
  };
  rollback?: {
    configured?: unknown;
    rollbackPolicyConfigured?: unknown;
    stagedRolloutConfigured?: unknown;
    rollbackTestRecorded?: unknown;
    rollbackPolicySummary?: unknown;
  };
  verification?: {
    configured?: unknown;
    updateManifestVerified?: unknown;
    installerUpdatePathVerified?: unknown;
    signedUpdateVerified?: unknown;
    policyReviewPassed?: unknown;
  };
  artifacts?: UpdaterArtifact[];
  reviewer?: {
    name?: unknown;
    completedAt?: unknown;
    decision?: unknown;
  };
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    updateSigningSecretsExcluded?: unknown;
    updaterEndpointSecretsExcluded?: unknown;
    stackTracesExcluded?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const defaultResultPath = resolve(releaseDir, "lumatrace-windows-updater-policy-readiness-result.json");
const templatePath = resolve(releaseDir, "lumatrace-windows-updater-policy-readiness-template.json");
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
    !/"(?:authToken|token|secret|password|privateKeyPath|updateEndpoint|endpointSecret|publicKeyPath)"\s*:\s*"[^"]{3,}"/iu.test(
      normalized
    ) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|updateSigningCommand)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function readJson(path: string): WindowsUpdaterPolicyReadinessDocument {
  return JSON.parse(readFileSync(path, "utf8")) as WindowsUpdaterPolicyReadinessDocument;
}

check("updater policy readiness template exists", existsSync(templatePath));
check("updater policy readiness result exists", existsSync(resultPath));

if (!existsSync(templatePath) || !existsSync(resultPath)) {
  console.error(
    "Run pnpm verify:windows-updater-policy-readiness-template first, then pass a filled result JSON path to this verifier."
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

check("updater policy readiness result is sanitized", hasCleanText(resultText));
check("result evidence kind is windows-updater-policy-readiness-result", result.evidenceKind === "windows-updater-policy-readiness-result");
check("result status is policy_decided", result.status === "policy_decided");
check("configured flag is true", result.configured === true);
check("productionReady remains false", result.productionReady === false);
check("unsigned draft remains explicit", result.unsignedDraft === true);
check("updater policy is configured", result.updater?.configured === true);
check("updater provider summary is recorded", isNonEmptyString(result.updater?.provider));
check("updater provider is not not_configured", result.updater?.provider !== "not_configured");
check("updater endpoint summary is recorded", result.updater?.endpointRecorded === true);
check("updater endpoint summary is sanitized", isNonEmptyString(result.updater?.endpointSummarySanitized));
check("channel strategy is configured", result.updater?.channelStrategyConfigured === true);
check("channel strategy summary is present", isNonEmptyString(result.updater?.channelStrategy));
check("auto update remains disabled in 4B result", result.updater?.autoUpdateEnabled === false);
check("update signing policy is configured", result.updateSigning?.configured === true);
check("update signing public key raw value is not recorded", result.updateSigning?.publicKeyRecorded === false);
check("update signing private key is not available", result.updateSigning?.privateKeyAvailable === false);
check("update signing command is not recorded", result.updateSigning?.signingCommandRecorded === false);
check("update signing policy summary is present", isNonEmptyString(result.updateSigning?.signingPolicy));
check("rollback policy is configured", result.rollback?.configured === true);
check("rollback policy configured flag is true", result.rollback?.rollbackPolicyConfigured === true);
check("staged rollout policy is configured", result.rollback?.stagedRolloutConfigured === true);
check("rollback test policy is recorded", result.rollback?.rollbackTestRecorded === true);
check("rollback summary is present", isNonEmptyString(result.rollback?.rollbackPolicySummary));
check("verification policy is configured", result.verification?.configured === true);
check("update manifest verification policy recorded", result.verification?.updateManifestVerified === true);
check("installer update path verification policy recorded", result.verification?.installerUpdatePathVerified === true);
check("signed update verification policy recorded", result.verification?.signedUpdateVerified === true);
check("policy review passed", result.verification?.policyReviewPassed === true);
check("result has same artifact count as template", resultArtifacts.length === templateArtifacts.length);
check("result artifact file names are unique", resultFileNameSet.size === resultArtifacts.length);
check("result contains every template artifact", templateFileNames.every((fileName) => resultFileNameSet.has(fileName)));
check(
  "all existing RC artifacts retain original hashes",
  templateArtifacts
    .filter((artifact) => artifact.exists === true)
    .every((templateArtifact) =>
      resultArtifacts.some(
        (artifact) =>
          artifact.fileName === templateArtifact.fileName &&
          artifact.sha256 === templateArtifact.sha256 &&
          artifact.policyReviewed === true
      )
    )
);
check(
  "artifact summaries do not use paths",
  resultArtifacts.every((artifact) => typeof artifact.fileName === "string" && !/[\\/]/u.test(artifact.fileName))
);
check("reviewer name is filled", isNonEmptyString(result.reviewer?.name));
check("reviewer completedAt is filled", isNonEmptyString(result.reviewer?.completedAt));
check("reviewer decision is policy_decided", result.reviewer?.decision === "policy_decided");
check("token redaction asserted", result.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", result.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", result.securityAssertions?.rawLogsExcluded === true);
check("update signing secrets excluded", result.securityAssertions?.updateSigningSecretsExcluded === true);
check("updater endpoint secrets excluded", result.securityAssertions?.updaterEndpointSecretsExcluded === true);
check("stack traces excluded", result.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows updater policy readiness result verification failed");
  process.exit(1);
}

console.log("Windows updater policy readiness result verification passed");
