import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ImportEntry {
  gate?: unknown;
  blockerCode?: unknown;
  resultFile?: unknown;
  templateFile?: unknown;
  sourceFile?: unknown;
  status?: unknown;
  copied?: unknown;
  verifierCommand?: unknown;
  rcGateSmokeCommand?: unknown;
  sha256?: unknown;
  sizeBytes?: unknown;
  verifierExitCode?: unknown;
  reason?: unknown;
}

interface ImportManifest {
  evidenceKind?: unknown;
  status?: unknown;
  sourceDirectoryKind?: unknown;
  dryRun?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  importSummary?: {
    total?: unknown;
    valid?: unknown;
    invalid?: unknown;
    missing?: unknown;
    copied?: unknown;
  };
  results?: ImportEntry[];
  ignoredFiles?: unknown[];
  refreshedIntake?: {
    fileName?: unknown;
    status?: unknown;
    validResults?: unknown;
    invalidResults?: unknown;
    missingResults?: unknown;
  };
  nextCommands?: unknown[];
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawVerifierOutputExcluded?: unknown;
    rawLogsExcluded?: unknown;
    reviewerNotesExcluded?: unknown;
    sourceDirectoryPathExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const manifestPath = resolve(
  root,
  "apps/desktop/src-tauri/target/release/lumatrace-windows-release-gate-results-import-manifest.json"
);
const knownStatuses = new Set([
  "missing_source",
  "valid_imported",
  "valid_dry_run",
  "invalid_rejected"
]);
const knownManifestStatuses = new Set([
  "no_results_found",
  "valid_results_imported",
  "invalid_results_rejected",
  "mixed_results",
  "dry_run"
]);

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password|reviewerNote|evidenceNote|sourceDirectory)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function isSafeFileName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[\\/]/u.test(value);
}

check("release gate results import manifest exists", existsSync(manifestPath));
if (!existsSync(manifestPath)) {
  process.exit(1);
}

const text = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(text) as ImportManifest;
const results = manifest.results ?? [];
const valid = results.filter((entry) => entry.status === "valid_imported" || entry.status === "valid_dry_run");
const invalid = results.filter((entry) => entry.status === "invalid_rejected");
const missing = results.filter((entry) => entry.status === "missing_source");
const copied = results.filter((entry) => entry.copied === true);

check("release gate results import manifest is sanitized", hasCleanText(text));
check("evidence kind is release gate results import", manifest.evidenceKind === "windows-release-gate-results-import");
check("manifest status is known", typeof manifest.status === "string" && knownManifestStatuses.has(manifest.status));
check("source directory kind is bounded", ["workspace_results", "custom_results_dir"].includes(String(manifest.sourceDirectoryKind)));
check("dryRun is boolean", typeof manifest.dryRun === "boolean");
check("RC candidate remains false", manifest.rcCandidateReady === false);
check("productionReady remains false", manifest.productionReady === false);
check("unsigned draft remains explicit", manifest.unsignedDraft === true);
check("six import entries are present", results.length === 6);
check("result statuses are known", results.every((entry) => typeof entry.status === "string" && knownStatuses.has(entry.status)));
check("result file names are stable", results.every((entry) => isSafeFileName(entry.resultFile)));
check("template file names are stable", results.every((entry) => isSafeFileName(entry.templateFile)));
check("source file names are stable", results.every((entry) => isSafeFileName(entry.sourceFile)));
check("verifier command labels are present", results.every((entry) => typeof entry.verifierCommand === "string"));
check("RC smoke command labels are present", results.every((entry) => typeof entry.rcGateSmokeCommand === "string"));
check("valid entries have hash and size", valid.every((entry) => typeof entry.sha256 === "string" && typeof entry.sizeBytes === "number"));
check("invalid entries record verifier exit", invalid.every((entry) => typeof entry.verifierExitCode === "number"));
check("missing entries are not copied", missing.every((entry) => entry.copied === false));
check("copied entries are valid imports", copied.every((entry) => entry.status === "valid_imported"));
check("summary total matches results", manifest.importSummary?.total === results.length);
check("summary valid matches results", manifest.importSummary?.valid === valid.length);
check("summary invalid matches results", manifest.importSummary?.invalid === invalid.length);
check("summary missing matches results", manifest.importSummary?.missing === missing.length);
check("summary copied matches results", manifest.importSummary?.copied === copied.length);
check("refreshed intake summary is present", manifest.refreshedIntake?.fileName === "lumatrace-windows-release-gate-results-intake.json");
check("next commands are present", Array.isArray(manifest.nextCommands) && manifest.nextCommands.length > 0);
check("ignored files are stable names", (manifest.ignoredFiles ?? []).every(isSafeFileName));
check("token redaction asserted", manifest.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", manifest.securityAssertions?.fullLocalPathsRedacted === true);
check("raw verifier output excluded", manifest.securityAssertions?.rawVerifierOutputExcluded === true);
check("raw logs excluded", manifest.securityAssertions?.rawLogsExcluded === true);
check("reviewer notes excluded", manifest.securityAssertions?.reviewerNotesExcluded === true);
check("source directory path excluded", manifest.securityAssertions?.sourceDirectoryPathExcluded === true);
check("public sidecar listeners disallowed", manifest.securityAssertions?.publicSidecarListenersAllowed === false);

if (process.exitCode === 1) {
  console.error("Windows release gate results import manifest verification failed");
  process.exit(1);
}

console.log("Windows release gate results import manifest verification passed");
