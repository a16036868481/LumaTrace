import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

interface HandoffFile {
  fileName?: unknown;
  sha256?: unknown;
  sizeBytes?: unknown;
}

interface GateAction {
  gate?: unknown;
  blockerCode?: unknown;
  templateFile?: unknown;
  resultFile?: unknown;
  verifierCommand?: unknown;
  rcGateSmokeCommand?: unknown;
  requiresHumanReview?: unknown;
}

interface WindowsReleaseGateHandoff {
  evidenceKind?: unknown;
  status?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  handoffDirectory?: unknown;
  blockers?: unknown[];
  gateActions?: GateAction[];
  files?: HandoffFile[];
  excludedFiles?: unknown[];
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    rawStdoutStderrExcluded?: unknown;
    rawLicenseTextExcluded?: unknown;
    reviewerNotesExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const handoffDir = resolve(releaseDir, "lumatrace-windows-release-gate-handoff");
const manifestPath = resolve(releaseDir, "lumatrace-windows-release-gate-handoff-manifest.json");

const requiredFiles = [
  "README.md",
  "windows-release-gate-handoff.md",
  "lumatrace-windows-packaging-rc-gate.json",
  "lumatrace-windows-packaging-release-readiness.json",
  "lumatrace-windows-release-policy-template.json",
  "lumatrace-windows-manual-gui-qa-template.json",
  "lumatrace-windows-manual-gui-qa-handoff-manifest.json",
  "lumatrace-windows-sidecar-production-readiness-template.json",
  "lumatrace-windows-license-review-template.json",
  "lumatrace-windows-code-signing-readiness-template.json",
  "lumatrace-windows-updater-policy-readiness-template.json",
  "lumatrace-windows-release-approval-readiness-template.json",
  "sidecar-manifest.json",
  "packaging-notices.json"
] as const;

const requiredBlockers = [
  "MANUAL_GUI_QA",
  "SIDECAR_PRODUCTION_READINESS",
  "LICENSE_NOTICE_REVIEW",
  "CODE_SIGNING",
  "UPDATER_POLICY",
  "RELEASE_APPROVAL"
] as const;

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/"(?:authToken|token)"\s*:\s*"[^"]{8,}"/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|reviewerNotes|evidenceNotes)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

check("release gate handoff manifest exists", existsSync(manifestPath));
check("release gate handoff directory exists", existsSync(handoffDir));
if (!existsSync(manifestPath) || !existsSync(handoffDir)) {
  process.exit(1);
}

const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText) as WindowsReleaseGateHandoff;
const files = manifest.files ?? [];
const actions = manifest.gateActions ?? [];
const fileByName = new Map(
  files.filter((file) => typeof file.fileName === "string").map((file) => [file.fileName as string, file])
);

check("release gate handoff manifest is sanitized", hasCleanText(manifestText));
check("evidence kind is windows-release-gate-handoff", manifest.evidenceKind === "windows-release-gate-handoff");
check("handoff status is ready", manifest.status === "handoff_ready");
check("RC candidate remains false", manifest.rcCandidateReady === false);
check("productionReady remains false", manifest.productionReady === false);
check("unsigned draft remains explicit", manifest.unsignedDraft === true);
check("handoff directory is relative", manifest.handoffDirectory === "lumatrace-windows-release-gate-handoff");
check("blockers are listed", Array.isArray(manifest.blockers));
check("gate actions cover all release blockers", requiredBlockers.every((blocker) => actions.some((a) => a.blockerCode === blocker)));
check("all gate actions require human review", actions.every((action) => action.requiresHumanReview === true));
check("all gate actions have template files", actions.every((action) => typeof action.templateFile === "string"));
check("all gate actions have result files", actions.every((action) => typeof action.resultFile === "string"));
check("all gate actions have verifier commands", actions.every((action) => typeof action.verifierCommand === "string"));
check("all gate actions have RC smoke commands", actions.every((action) => typeof action.rcGateSmokeCommand === "string"));
check("token redaction asserted", manifest.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", manifest.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", manifest.securityAssertions?.rawLogsExcluded === true);
check("raw stdout/stderr excluded", manifest.securityAssertions?.rawStdoutStderrExcluded === true);
check("raw license text excluded", manifest.securityAssertions?.rawLicenseTextExcluded === true);
check("reviewer notes excluded", manifest.securityAssertions?.reviewerNotesExcluded === true);
check("public sidecar listeners disallowed", manifest.securityAssertions?.publicSidecarListenersAllowed === false);
check(
  "result files are excluded",
  (manifest.excludedFiles ?? []).some((value) => value === "release gate result files")
);

for (const fileName of requiredFiles) {
  const path = resolve(handoffDir, fileName);
  const entry = fileByName.get(fileName);
  check(`handoff file exists: ${fileName}`, existsSync(path));
  check(`handoff manifest includes: ${fileName}`, entry !== undefined);
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    check(`handoff file is sanitized: ${fileName}`, hasCleanText(text));
    if (entry !== undefined) {
      check(`handoff hash matches: ${fileName}`, entry.sha256 === sha256(path));
      check(`handoff size matches: ${fileName}`, entry.sizeBytes === statSync(path).size);
    }
  }
}

const readme = readFileSync(resolve(handoffDir, "README.md"), "utf8");
check("README says not release approval", /not release approval/i.test(readme));
check("README says productionReady false", /productionReady false/i.test(readme));
check("README lists verifier commands", /verify:windows-manual-gui-qa-result/i.test(readme));
check("README says one gate removes only one blocker", /one gate removes only that gate/i.test(readme));

if (process.exitCode === 1) {
  console.error("Windows release gate handoff verification failed");
  process.exit(1);
}

console.log("Windows release gate handoff verification passed");
