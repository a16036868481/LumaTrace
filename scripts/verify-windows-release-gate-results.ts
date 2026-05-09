import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface GateResultEntry {
  gate?: unknown;
  blockerCode?: unknown;
  resultFile?: unknown;
  templateFile?: unknown;
  status?: unknown;
  canRemoveBlocker?: unknown;
  verifierCommand?: unknown;
  rcGateSmokeCommand?: unknown;
  sha256?: unknown;
  sizeBytes?: unknown;
  verifierExitCode?: unknown;
  reason?: unknown;
}

interface WindowsReleaseGateResultsIntake {
  evidenceKind?: unknown;
  status?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  currentRcBlockers?: unknown[];
  results?: GateResultEntry[];
  nextCommands?: unknown[];
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawVerifierOutputExcluded?: unknown;
    rawLogsExcluded?: unknown;
    reviewerNotesExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const intakePath = resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json");

const expectedBlockers = [
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

check("release gate results intake exists", existsSync(intakePath));
if (!existsSync(intakePath)) {
  process.exit(1);
}

const intakeText = readFileSync(intakePath, "utf8");
const intake = JSON.parse(intakeText) as WindowsReleaseGateResultsIntake;
const results = intake.results ?? [];
const resultByBlocker = new Map(
  results
    .filter((entry) => typeof entry.blockerCode === "string")
    .map((entry) => [entry.blockerCode as string, entry])
);
const validResults = results.filter((entry) => entry.status === "valid_result");
const invalidResults = results.filter((entry) => entry.status === "invalid_result");
const missingResults = results.filter((entry) => entry.status === "missing_result");

check("release gate results intake is sanitized", hasCleanText(intakeText));
check("evidence kind is release gate results intake", intake.evidenceKind === "windows-release-gate-results-intake");
check("status is known", ["no_results", "partial_results", "all_results_valid", "invalid_results"].includes(String(intake.status)));
check("RC candidate remains false", intake.rcCandidateReady === false);
check("productionReady remains false", intake.productionReady === false);
check("unsigned draft remains explicit", intake.unsignedDraft === true);
check("all release blockers have result entries", expectedBlockers.every((blocker) => resultByBlocker.has(blocker)));
check("results have stable file names", results.every((entry) => typeof entry.resultFile === "string" && !/[\\/]/u.test(entry.resultFile)));
check("templates have stable file names", results.every((entry) => typeof entry.templateFile === "string" && !/[\\/]/u.test(entry.templateFile)));
check("results have verifier commands", results.every((entry) => typeof entry.verifierCommand === "string"));
check("results have RC smoke commands", results.every((entry) => typeof entry.rcGateSmokeCommand === "string"));
check("result status matches canRemoveBlocker", results.every((entry) => (entry.status === "valid_result") === (entry.canRemoveBlocker === true)));
check(
  "valid results include hash and size",
  validResults.every((entry) => typeof entry.sha256 === "string" && typeof entry.sizeBytes === "number")
);
check("invalid results record verifier exit", invalidResults.every((entry) => typeof entry.verifierExitCode === "number"));
check("missing results do not claim blocker removal", missingResults.every((entry) => entry.canRemoveBlocker === false));
check("token redaction asserted", intake.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", intake.securityAssertions?.fullLocalPathsRedacted === true);
check("raw verifier output excluded", intake.securityAssertions?.rawVerifierOutputExcluded === true);
check("raw logs excluded", intake.securityAssertions?.rawLogsExcluded === true);
check("reviewer notes excluded", intake.securityAssertions?.reviewerNotesExcluded === true);
check("public sidecar listeners disallowed", intake.securityAssertions?.publicSidecarListenersAllowed === false);
check("next commands are present", Array.isArray(intake.nextCommands) && intake.nextCommands.length > 0);

if (intake.status === "no_results") {
  check("no_results has no valid results", validResults.length === 0);
  check("no_results has no invalid results", invalidResults.length === 0);
}
if (intake.status === "all_results_valid") {
  check("all_results_valid covers every gate", validResults.length === expectedBlockers.length);
}
if (intake.status === "invalid_results") {
  check("invalid_results has invalid entries", invalidResults.length > 0);
}

if (process.exitCode === 1) {
  console.error("Windows release gate results intake verification failed");
  process.exit(1);
}

console.log("Windows release gate results intake verification passed");
