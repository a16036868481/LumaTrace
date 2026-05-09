import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

interface WorkspaceFile {
  role?: unknown;
  relativePath?: unknown;
  fileName?: unknown;
  sha256?: unknown;
  sizeBytes?: unknown;
}

interface WorkspaceDraft {
  gate?: unknown;
  blockerCode?: unknown;
  draftFile?: unknown;
  expectedResultFile?: unknown;
  sourceTemplateFile?: unknown;
  verifierCommand?: unknown;
  rcGateSmokeCommand?: unknown;
  canRemoveBlocker?: unknown;
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

interface WindowsReleaseResultWorkspace {
  evidenceKind?: unknown;
  status?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  workspaceDirectory?: unknown;
  currentIntake?: {
    exists?: unknown;
    status?: unknown;
    validResults?: unknown;
    invalidResults?: unknown;
    missingResults?: unknown;
  };
  gateActions?: GateAction[];
  drafts?: WorkspaceDraft[];
  files?: WorkspaceFile[];
  excludedFiles?: unknown[];
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    rawStdoutStderrExcluded?: unknown;
    rawLicenseTextExcluded?: unknown;
    reviewerNotesExcluded?: unknown;
    evidenceNotesExcluded?: unknown;
    resultFilesExcludedFromReleaseRoot?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const workspaceDir = resolve(releaseDir, "lumatrace-windows-release-result-workspace");
const manifestPath = resolve(releaseDir, "lumatrace-windows-release-result-workspace-manifest.json");

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
    !/"(?:authToken|token|secret|password)"\s*:\s*"[^"]{8,}"/iu.test(normalized) &&
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

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

check("release result workspace manifest exists", existsSync(manifestPath));
check("release result workspace directory exists", existsSync(workspaceDir));
if (!existsSync(manifestPath) || !existsSync(workspaceDir)) {
  process.exit(1);
}

const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText) as WindowsReleaseResultWorkspace;
const gateActions = manifest.gateActions ?? [];
const drafts = manifest.drafts ?? [];
const files = manifest.files ?? [];
const fileByRelativePath = new Map(
  files
    .filter((file) => typeof file.relativePath === "string")
    .map((file) => [file.relativePath as string, file])
);

check("release result workspace manifest is sanitized", hasCleanText(manifestText));
check("evidence kind is windows-release-result-workspace", manifest.evidenceKind === "windows-release-result-workspace");
check("workspace status is ready", manifest.status === "workspace_ready");
check("RC candidate remains false", manifest.rcCandidateReady === false);
check("productionReady remains false", manifest.productionReady === false);
check("unsigned draft remains explicit", manifest.unsignedDraft === true);
check("workspace directory is relative", manifest.workspaceDirectory === "lumatrace-windows-release-result-workspace");
check("current intake summary exists", typeof manifest.currentIntake?.status === "string");
check("gate actions cover all release blockers", requiredBlockers.every((blocker) => gateActions.some((action) => action.blockerCode === blocker)));
check("drafts cover all release blockers", requiredBlockers.every((blocker) => drafts.some((draft) => draft.blockerCode === blocker)));
check("all gate actions require human review", gateActions.every((action) => action.requiresHumanReview === true));
check("all drafts cannot remove blockers", drafts.every((draft) => draft.canRemoveBlocker === false));
check("all drafts use draft suffix", drafts.every((draft) => typeof draft.draftFile === "string" && draft.draftFile.endsWith(".draft.json")));
check("token redaction asserted", manifest.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", manifest.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", manifest.securityAssertions?.rawLogsExcluded === true);
check("raw stdout/stderr excluded", manifest.securityAssertions?.rawStdoutStderrExcluded === true);
check("raw license text excluded", manifest.securityAssertions?.rawLicenseTextExcluded === true);
check("reviewer notes excluded", manifest.securityAssertions?.reviewerNotesExcluded === true);
check("evidence notes excluded", manifest.securityAssertions?.evidenceNotesExcluded === true);
check("release root result files excluded", manifest.securityAssertions?.resultFilesExcludedFromReleaseRoot === true);
check("public sidecar listeners disallowed", manifest.securityAssertions?.publicSidecarListenersAllowed === false);
check(
  "valid release result files are excluded",
  (manifest.excludedFiles ?? []).some((value) => value === "valid release result files")
);

for (const file of files) {
  if (typeof file.relativePath !== "string") {
    check("workspace file has relative path", false);
    continue;
  }
  const relativePath = file.relativePath;
  const path = resolve(workspaceDir, relativePath);
  check(`workspace file exists: ${relativePath}`, existsSync(path));
  check(`workspace relative path is safe: ${relativePath}`, !relativePath.includes("..") && !/^[A-Z]:/iu.test(relativePath));
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    check(`workspace file is sanitized: ${relativePath}`, hasCleanText(text));
    check(`workspace file hash matches: ${relativePath}`, file.sha256 === sha256(path));
    check(`workspace file size matches: ${relativePath}`, file.sizeBytes === statSync(path).size);
  }
}

check("README is tracked", fileByRelativePath.has("README.md"));
check("gate-result-map is tracked", fileByRelativePath.has("gate-result-map.json"));

for (const draft of drafts) {
  if (typeof draft.draftFile !== "string" || typeof draft.expectedResultFile !== "string") {
    check("draft has file names", false);
    continue;
  }
  const draftRelativePath = `drafts/${draft.draftFile}`;
  const draftPath = resolve(workspaceDir, draftRelativePath);
  check(`draft file is tracked: ${draft.draftFile}`, fileByRelativePath.has(draftRelativePath));
  check(`draft file exists: ${draft.draftFile}`, existsSync(draftPath));
  if (existsSync(draftPath)) {
    const draftJson = readJson(draftPath);
    check(`draft evidence kind is safe: ${draft.draftFile}`, draftJson.evidenceKind === "windows-release-result-draft");
    check(`draft status is pending: ${draft.draftFile}`, draftJson.status === "draft_pending");
    check(`draft cannot remove blocker: ${draft.draftFile}`, draftJson.canRemoveBlocker === false);
    check(`draft productionReady false: ${draft.draftFile}`, draftJson.productionReady === false);
    check(`draft expected file name is stable: ${draft.draftFile}`, draftJson.expectedResultFile === draft.expectedResultFile);
  }
}

const readme = readFileSync(resolve(workspaceDir, "README.md"), "utf8");
check("README says drafts are not valid release results", /not valid release results/i.test(readme));
check("README says productionReady remains false", /productionReady.*false/i.test(readme));
check("README lists gate map", /Gate Map/i.test(readme));

if (process.exitCode === 1) {
  console.error("Windows release result workspace verification failed");
  process.exit(1);
}

console.log("Windows release result workspace verification passed");
