import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ReadinessBlocker {
  code?: unknown;
  requiredForProduction?: unknown;
}

interface WindowsPackagingReleaseReadiness {
  evidenceKind?: unknown;
  productionReady?: unknown;
  releaseStatus?: unknown;
  qaDraftStatus?: unknown;
  checks?: {
    selfContainedSidecarPresent?: unknown;
    productionSidecarReady?: unknown;
    codeSigningConfigured?: unknown;
    updaterConfigured?: unknown;
    storeDistributionConfigured?: unknown;
  };
  blockers?: ReadinessBlocker[];
}

const root = process.cwd();
const readinessPath = resolve(root, "apps/desktop/src-tauri/target/release/lumatrace-windows-packaging-release-readiness.json");
const requiredBlockers = [
  "SIDECAR_PRODUCTION_READY_FALSE",
  "CODE_SIGNING_NOT_CONFIGURED",
  "UPDATER_NOT_CONFIGURED",
  "PRODUCTION_APPROVAL_NOT_GRANTED"
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
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows packaging release readiness manifest exists", existsSync(readinessPath));
if (!existsSync(readinessPath)) {
  process.exit(1);
}

const text = readFileSync(readinessPath, "utf8");
const readiness = JSON.parse(text) as WindowsPackagingReleaseReadiness;
const blockerCodes = new Set(
  (readiness.blockers ?? []).map((blocker) => blocker.code).filter((code): code is string => typeof code === "string")
);

check("release readiness manifest is sanitized", hasCleanText(text));
check("evidence kind is windows-packaging-release-readiness", readiness.evidenceKind === "windows-packaging-release-readiness");
check("productionReady remains false", readiness.productionReady === false);
check("release status remains blocked", readiness.releaseStatus === "blocked");
check(
  "QA draft status is explicit",
  readiness.qaDraftStatus === "automated_ready_manual_pending" ||
    readiness.qaDraftStatus === "manual_result_present_release_blocked" ||
    readiness.qaDraftStatus === "missing_required_artifacts"
);
check("code signing is not configured", readiness.checks?.codeSigningConfigured === false);
check("updater is not configured", readiness.checks?.updaterConfigured === false);
check("store distribution is not configured", readiness.checks?.storeDistributionConfigured === false);
check("production sidecar is not marked ready", readiness.checks?.productionSidecarReady !== true);

for (const blocker of requiredBlockers) {
  check(`required blocker present: ${blocker}`, blockerCodes.has(blocker));
}

check(
  "all blockers are production blockers",
  (readiness.blockers ?? []).length > 0 && (readiness.blockers ?? []).every((blocker) => blocker.requiredForProduction === true)
);

if (process.exitCode === 1) {
  console.error("Windows packaging release readiness verification failed");
  process.exit(1);
}

console.log("Windows packaging release readiness verification passed");
