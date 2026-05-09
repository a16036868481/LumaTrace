import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface UpdaterArtifact {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  requiredForRc?: unknown;
}

interface WindowsUpdaterPolicyReadinessTemplate {
  evidenceKind?: unknown;
  status?: unknown;
  configured?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  updater?: {
    configured?: unknown;
    provider?: unknown;
    endpointRecorded?: unknown;
    channelStrategyConfigured?: unknown;
    autoUpdateEnabled?: unknown;
  };
  updateSigning?: {
    configured?: unknown;
    publicKeyRecorded?: unknown;
    privateKeyAvailable?: unknown;
    signingCommandRecorded?: unknown;
  };
  rollback?: {
    configured?: unknown;
    rollbackPolicyConfigured?: unknown;
    stagedRolloutConfigured?: unknown;
    rollbackTestRecorded?: unknown;
  };
  verification?: {
    configured?: unknown;
    updateManifestVerified?: unknown;
    installerUpdatePathVerified?: unknown;
    signedUpdateVerified?: unknown;
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

const templatePath = resolve(
  "apps/desktop/src-tauri/target/release/lumatrace-windows-updater-policy-readiness-template.json"
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|privateKeyPath|updateEndpoint)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"configured"\s*:\s*true/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows updater policy readiness template exists", existsSync(templatePath));
if (!existsSync(templatePath)) {
  process.exit(1);
}

const text = readFileSync(templatePath, "utf8");
const template = JSON.parse(text) as WindowsUpdaterPolicyReadinessTemplate;
const artifacts = template.artifacts ?? [];

check("updater template is sanitized", clean(text));
check(
  "evidence kind is windows-updater-policy-readiness-template",
  template.evidenceKind === "windows-updater-policy-readiness-template"
);
check("template status remains not_configured", template.status === "not_configured");
check("configured remains false", template.configured === false);
check("productionReady remains false", template.productionReady === false);
check("unsigned draft remains true", template.unsignedDraft === true);
check("updater is not configured", template.updater?.configured === false);
check("updater provider is not configured", template.updater?.provider === "not_configured");
check("updater endpoint is not recorded", template.updater?.endpointRecorded === false);
check("channel strategy is not configured", template.updater?.channelStrategyConfigured === false);
check("auto update remains disabled", template.updater?.autoUpdateEnabled === false);
check("update signing is not configured", template.updateSigning?.configured === false);
check("update signing public key is not recorded", template.updateSigning?.publicKeyRecorded === false);
check("update signing private key is not available", template.updateSigning?.privateKeyAvailable === false);
check("update signing command is not recorded", template.updateSigning?.signingCommandRecorded === false);
check("rollback is not configured", template.rollback?.configured === false);
check("rollback policy is not configured", template.rollback?.rollbackPolicyConfigured === false);
check("staged rollout is not configured", template.rollback?.stagedRolloutConfigured === false);
check("rollback test is not recorded", template.rollback?.rollbackTestRecorded === false);
check("update verification is not configured", template.verification?.configured === false);
check("update manifest is not verified", template.verification?.updateManifestVerified === false);
check("installer update path is not verified", template.verification?.installerUpdatePathVerified === false);
check("signed update is not verified", template.verification?.signedUpdateVerified === false);
check("updater artifacts are present", artifacts.length >= 3);
check(
  "installer draft artifact is represented",
  artifacts.some((artifact) => artifact.fileName === "lumatrace-installer-draft-manifest.json")
);
check("artifacts use relative file names", artifacts.every((artifact) => typeof artifact.fileName === "string" && !/[\\/]/u.test(artifact.fileName)));
check("all artifacts are RC-required", artifacts.every((artifact) => artifact.requiredForRc === true));
check("existing artifacts have hashes", artifacts.filter((artifact) => artifact.exists === true).every((artifact) => typeof artifact.sha256 === "string"));
check("reviewer name starts empty", template.reviewer?.name === null);
check("reviewer completedAt starts empty", template.reviewer?.completedAt === null);
check("reviewer decision starts pending", template.reviewer?.decision === "pending");
check("token redaction asserted", template.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", template.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", template.securityAssertions?.rawLogsExcluded === true);
check("update signing secrets excluded", template.securityAssertions?.updateSigningSecretsExcluded === true);
check("updater endpoint secrets excluded", template.securityAssertions?.updaterEndpointSecretsExcluded === true);
check("stack traces excluded", template.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows updater policy readiness template verification failed");
  process.exit(1);
}

console.log("Windows updater policy readiness template verification passed");
