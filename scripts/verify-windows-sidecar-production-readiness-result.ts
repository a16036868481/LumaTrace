import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

interface SidecarEvidence {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  requiredForRc?: unknown;
  reviewed?: unknown;
  productionReady?: unknown;
}

interface WindowsSidecarProductionReadinessDocument {
  evidenceKind?: unknown;
  status?: unknown;
  approved?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  sidecar?: {
    manifestFile?: unknown;
    artifactKind?: unknown;
    fileName?: unknown;
    targetTriple?: unknown;
    sha256?: unknown;
    nodeRequired?: unknown;
    runtimeDirectory?: unknown;
    runtimeSizeBytes?: unknown;
    runtimeFileCount?: unknown;
    bundledNodeVersion?: unknown;
    manifestProductionReady?: unknown;
  };
  checks?: {
    selfContainedDraftPresent?: unknown;
    bundledRuntimeRecorded?: unknown;
    nodeRequiredFalse?: unknown;
    releaseSidecarSmokePassed?: unknown;
    sidecarAuthTransportSmokePassed?: unknown;
    installedSidecarHealthSmokePassed?: unknown;
    publicSidecarListenersAllowed?: unknown;
    licenseReviewApproved?: unknown;
  };
  evidence?: SidecarEvidence[];
  reviewer?: {
    name?: unknown;
    completedAt?: unknown;
    decision?: unknown;
  };
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    rawStdoutStderrExcluded?: unknown;
    commandLinesExcluded?: unknown;
    stackTracesExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const defaultResultPath = resolve(releaseDir, "lumatrace-windows-sidecar-production-readiness-result.json");
const templatePath = resolve(releaseDir, "lumatrace-windows-sidecar-production-readiness-template.json");
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
    !/"(?:authToken|token|secret|password|runtimePath|artifactPath)"\s*:\s*"[^"]{3,}"/iu.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function readJson(path: string): WindowsSidecarProductionReadinessDocument {
  return JSON.parse(readFileSync(path, "utf8")) as WindowsSidecarProductionReadinessDocument;
}

check("sidecar production readiness template exists", existsSync(templatePath));
check("sidecar production readiness result exists", existsSync(resultPath));

if (!existsSync(templatePath) || !existsSync(resultPath)) {
  console.error(
    "Run pnpm verify:windows-sidecar-production-readiness-template first, then pass a filled result JSON path to this verifier."
  );
  process.exit(1);
}

const template = readJson(templatePath);
const resultText = readFileSync(resultPath, "utf8");
const result = readJson(resultPath);
const templateEvidence = template.evidence ?? [];
const resultEvidence = result.evidence ?? [];
const templateFileNames = templateEvidence
  .map((item) => item.fileName)
  .filter((fileName): fileName is string => typeof fileName === "string");
const resultFileNames = resultEvidence
  .map((item) => item.fileName)
  .filter((fileName): fileName is string => typeof fileName === "string");
const resultFileNameSet = new Set(resultFileNames);

check("sidecar production readiness result is sanitized", hasCleanText(resultText));
check("result evidence kind is windows-sidecar-production-readiness-result", result.evidenceKind === "windows-sidecar-production-readiness-result");
check("result status is approved", result.status === "approved");
check("approved flag is true", result.approved === true);
check("productionReady remains false", result.productionReady === false);
check("unsigned draft remains explicit", result.unsignedDraft === true);
check("sidecar manifest file is relative", result.sidecar?.manifestFile === "sidecar-manifest.json");
check("sidecar artifact kind is self-contained", result.sidecar?.artifactKind === "self-contained");
check("sidecar file name is relative", isNonEmptyString(result.sidecar?.fileName) && !/[\\/]/u.test(result.sidecar.fileName));
check("target triple is recorded", isNonEmptyString(result.sidecar?.targetTriple));
check("sidecar hash is recorded", isNonEmptyString(result.sidecar?.sha256));
check("nodeRequired remains false", result.sidecar?.nodeRequired === false);
check("runtime directory is relative", isNonEmptyString(result.sidecar?.runtimeDirectory) && !/[\\/]/u.test(result.sidecar.runtimeDirectory));
check("runtime size is recorded", typeof result.sidecar?.runtimeSizeBytes === "number");
check("runtime file count is recorded", typeof result.sidecar?.runtimeFileCount === "number");
check("bundled node version is recorded", isNonEmptyString(result.sidecar?.bundledNodeVersion));
check("sidecar manifest productionReady is not true", result.sidecar?.manifestProductionReady !== true);
check("self-contained draft present", result.checks?.selfContainedDraftPresent === true);
check("bundled runtime recorded", result.checks?.bundledRuntimeRecorded === true);
check("nodeRequired false check passed", result.checks?.nodeRequiredFalse === true);
check("release sidecar smoke passed", result.checks?.releaseSidecarSmokePassed === true);
check("auth transport smoke passed", result.checks?.sidecarAuthTransportSmokePassed === true);
check("installed sidecar health smoke passed", result.checks?.installedSidecarHealthSmokePassed === true);
check("public sidecar listeners remain disallowed", result.checks?.publicSidecarListenersAllowed === false);
check("license review is not granted by sidecar result", result.checks?.licenseReviewApproved === false);
check("result has same evidence count as template", resultEvidence.length === templateEvidence.length);
check("result evidence file names are unique", resultFileNameSet.size === resultEvidence.length);
check("result contains every template evidence file", templateFileNames.every((fileName) => resultFileNameSet.has(fileName)));
check(
  "all existing evidence retains original hashes",
  templateEvidence
    .filter((item) => item.exists === true)
    .every((templateItem) =>
      resultEvidence.some(
        (item) => item.fileName === templateItem.fileName && item.sha256 === templateItem.sha256 && item.reviewed === true
      )
    )
);
check("evidence summaries use relative names", resultEvidence.every((item) => typeof item.fileName === "string" && !/[\\/]/u.test(item.fileName)));
check("evidence does not claim production ready", resultEvidence.every((item) => item.productionReady !== true));
check("reviewer name is filled", isNonEmptyString(result.reviewer?.name));
check("reviewer completedAt is filled", isNonEmptyString(result.reviewer?.completedAt));
check("reviewer decision is approved", result.reviewer?.decision === "approved");
check("token redaction asserted", result.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", result.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", result.securityAssertions?.rawLogsExcluded === true);
check("raw stdout/stderr excluded", result.securityAssertions?.rawStdoutStderrExcluded === true);
check("command lines excluded", result.securityAssertions?.commandLinesExcluded === true);
check("stack traces excluded", result.securityAssertions?.stackTracesExcluded === true);
check("security assertion public sidecar listeners disallowed", result.securityAssertions?.publicSidecarListenersAllowed === false);

if (process.exitCode === 1) {
  console.error("Windows sidecar production readiness result verification failed");
  process.exit(1);
}

console.log("Windows sidecar production readiness result verification passed");
