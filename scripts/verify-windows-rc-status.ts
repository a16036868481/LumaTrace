import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface WindowsRcStatusDocument {
  evidenceKind?: unknown;
  status?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  windowsRcStatus?: {
    status?: unknown;
    rcCandidateReady?: unknown;
    productionReady?: unknown;
    evidence?: {
      artifactKind?: unknown;
      selfContainedSidecar?: unknown;
      sidecarProductionReady?: unknown;
      manualGuiQaResultStatus?: unknown;
    };
    gateCounts?: {
      total?: unknown;
      blocked?: unknown;
      missing?: unknown;
    };
    blockers?: Array<{
      code?: unknown;
      source?: unknown;
      requiredForRc?: unknown;
    }>;
    nextActions?: unknown[];
  };
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    rawStdoutStderrExcluded?: unknown;
    reviewerNotesExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
  limitations?: unknown[];
}

const root = process.cwd();
const statusPath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-rc-status.json");

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
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows RC status manifest exists", existsSync(statusPath));
if (!existsSync(statusPath)) {
  process.exit(1);
}

const text = readFileSync(statusPath, "utf8");
const document = JSON.parse(text) as WindowsRcStatusDocument;
const rcStatus = document.windowsRcStatus;
const blockers = rcStatus?.blockers ?? [];

check("Windows RC status manifest is sanitized", hasCleanText(text));
check("evidence kind is windows-rc-status", document.evidenceKind === "windows-rc-status");
check(
  "status is known",
  document.status === "missing_evidence" ||
    document.status === "blocked" ||
    document.status === "ready_for_rc_review"
);
check("RC candidate is not silently ready", document.rcCandidateReady === false);
check("productionReady remains false", document.productionReady === false);
check("unsigned draft remains explicit", document.unsignedDraft === true);
check("nested RC status is present", rcStatus !== undefined);
check("nested status matches top-level status", rcStatus?.status === document.status);
check("nested productionReady remains false", rcStatus?.productionReady === false);
check("sidecar artifact kind is recorded", typeof rcStatus?.evidence?.artifactKind === "string");
check("manual GUI QA result status is recorded", typeof rcStatus?.evidence?.manualGuiQaResultStatus === "string");
check("gate counts are recorded", typeof rcStatus?.gateCounts?.total === "number");
check("blockers are recorded while not ready", document.status === "ready_for_rc_review" || blockers.length > 0);
check(
  "all blockers require RC",
  blockers.every((blocker) => blocker.requiredForRc === true)
);
check(
  "blocker sources are stable",
  blockers.every(
    (blocker) =>
      blocker.source === "sidecar" ||
      blocker.source === "release_readiness" ||
      blocker.source === "rc_gate" ||
      blocker.source === "release_policy" ||
      blocker.source === "manual_gui_qa"
  )
);
check(
  "next actions are present",
  Array.isArray(rcStatus?.nextActions) && rcStatus.nextActions.length > 0
);
check("security assertion token redaction enabled", document.securityAssertions?.tokenRedacted === true);
check("security assertion path redaction enabled", document.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", document.securityAssertions?.rawLogsExcluded === true);
check("raw stdout/stderr excluded", document.securityAssertions?.rawStdoutStderrExcluded === true);
check("reviewer notes excluded", document.securityAssertions?.reviewerNotesExcluded === true);
check("public sidecar listeners disallowed", document.securityAssertions?.publicSidecarListenersAllowed === false);
check(
  "limitations say manifest is not release approval",
  (document.limitations ?? []).some((entry) => typeof entry === "string" && entry.includes("not release approval"))
);

if (process.exitCode === 1) {
  console.error("Windows RC status verification failed");
  process.exit(1);
}

console.log("Windows RC status verification passed");
