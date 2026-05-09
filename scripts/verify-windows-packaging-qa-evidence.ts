import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface EvidenceManifestSummary {
  fileName?: unknown;
  exists?: unknown;
  productionReady?: unknown;
}

interface WindowsPackagingQaEvidence {
  evidenceKind?: unknown;
  status?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  automatedEvidence?: {
    allRequiredPresent?: unknown;
    smokeSuiteStatus?: unknown;
    requiredManifests?: EvidenceManifestSummary[];
  };
  manualGuiQa?: {
    status?: unknown;
    requiredBeforeRelease?: unknown;
    checklistPath?: unknown;
    checklistItemCount?: unknown;
    result?: {
      exists?: unknown;
      validationStatus?: unknown;
      status?: unknown;
      passedSteps?: unknown;
      failedSteps?: unknown;
      blockedSteps?: unknown;
    };
  };
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    stackTracesExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const evidencePath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-packaging-qa-evidence.json");

const expectedManifests = [
  "lumatrace-tauri-sidecar-auth-transport-smoke-manifest.json",
  "lumatrace-bundle-draft-manifest.json",
  "lumatrace-installer-draft-manifest.json",
  "lumatrace-installer-smoke-manifest.json",
  "lumatrace-installed-app-launch-smoke-manifest.json",
  "lumatrace-installed-sidecar-health-smoke-manifest.json",
  "lumatrace-windows-packaging-smoke-suite-manifest.json"
] as const;

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function hasCleanText(text: string): boolean {
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text) &&
    !/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(text) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(text) &&
    !/"productionReady"\s*:\s*true/u.test(text)
  );
}

check("QA evidence manifest exists", existsSync(evidencePath));
if (!existsSync(evidencePath)) {
  process.exit(1);
}

const text = readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(text) as WindowsPackagingQaEvidence;
const manifestNames = new Set(
  (evidence.automatedEvidence?.requiredManifests ?? [])
    .map((manifest) => manifest.fileName)
    .filter((fileName): fileName is string => typeof fileName === "string")
);

check("QA evidence manifest is sanitized", hasCleanText(text));
check("evidence kind is windows-packaging-qa-evidence", evidence.evidenceKind === "windows-packaging-qa-evidence");
check("automated evidence is ready", evidence.status === "automated_evidence_ready");
check("productionReady remains false", evidence.productionReady === false);
check("unsigned draft is explicit", evidence.unsignedDraft === true);
check("all required manifests are present", evidence.automatedEvidence?.allRequiredPresent === true);
check("smoke suite succeeded", evidence.automatedEvidence?.smokeSuiteStatus === "success");

for (const fileName of expectedManifests) {
  check(`evidence references ${fileName}`, manifestNames.has(fileName));
}

const manualStatus = evidence.manualGuiQa?.status;
const manualResult = evidence.manualGuiQa?.result;
check(
  "manual GUI QA status is explicit",
  manualStatus === "not_run" ||
    manualStatus === "result_passed" ||
    manualStatus === "result_failed" ||
    manualStatus === "result_blocked" ||
    manualStatus === "result_invalid"
);
check(
  "manual GUI QA is not silently auto-passed",
  manualStatus !== "result_passed" || manualResult?.validationStatus === "valid"
);
check("manual GUI QA required flag matches status", evidence.manualGuiQa?.requiredBeforeRelease === (manualStatus !== "result_passed"));
check("manual checklist path is relative", evidence.manualGuiQa?.checklistPath === "docs/windows-packaging-manual-gui-checklist.md");
check(
  "manual checklist item count recorded",
  typeof evidence.manualGuiQa?.checklistItemCount === "number" && evidence.manualGuiQa.checklistItemCount > 0
);
if (manualResult?.exists === true) {
  check("manual result validation status is recorded", manualResult.validationStatus === "valid" || manualResult.validationStatus === "invalid");
  check("manual result step counts are recorded", typeof manualResult.passedSteps === "number");
  check("manual result summary contains no notes", !/"reviewerNote"|"evidenceNote"/u.test(text));
}
check("security assertion token redaction enabled", evidence.securityAssertions?.tokenRedacted === true);
check("security assertion path redaction enabled", evidence.securityAssertions?.fullLocalPathsRedacted === true);
check("security assertion raw logs excluded", evidence.securityAssertions?.rawLogsExcluded === true);
check("security assertion stack traces excluded", evidence.securityAssertions?.stackTracesExcluded === true);
check("public sidecar listeners remain disallowed", evidence.securityAssertions?.publicSidecarListenersAllowed === false);

for (const manifest of evidence.automatedEvidence?.requiredManifests ?? []) {
  check(`manifest exists in evidence: ${String(manifest.fileName)}`, manifest.exists === true);
  check(`manifest productionReady not true: ${String(manifest.fileName)}`, manifest.productionReady !== true);
}

if (process.exitCode === 1) {
  console.error("Windows packaging QA evidence verification failed");
  process.exit(1);
}

console.log("Windows packaging QA evidence verification passed");
