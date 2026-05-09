import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SidecarEvidence {
  fileName?: unknown;
  exists?: unknown;
  sha256?: unknown;
  productionReady?: unknown;
}

interface WindowsSidecarProductionReadinessTemplate {
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
    nodeRequired?: unknown;
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

const templatePath = resolve(
  "apps/desktop/src-tauri/target/release/lumatrace-windows-sidecar-production-readiness-template.json"
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"approved"\s*:\s*true/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows sidecar production readiness template exists", existsSync(templatePath));
if (!existsSync(templatePath)) {
  process.exit(1);
}

const text = readFileSync(templatePath, "utf8");
const template = JSON.parse(text) as WindowsSidecarProductionReadinessTemplate;
const evidence = template.evidence ?? [];

check("sidecar production readiness template is sanitized", clean(text));
check(
  "evidence kind is windows-sidecar-production-readiness-template",
  template.evidenceKind === "windows-sidecar-production-readiness-template"
);
check("template status remains draft_requires_review", template.status === "draft_requires_review");
check("approved remains false", template.approved === false);
check("productionReady remains false", template.productionReady === false);
check("unsigned draft remains true", template.unsignedDraft === true);
check("sidecar manifest file is relative", template.sidecar?.manifestFile === "sidecar-manifest.json");
check("sidecar artifact kind is recorded", typeof template.sidecar?.artifactKind === "string");
check("sidecar file name is relative", typeof template.sidecar?.fileName === "string" && !/[\\/]/u.test(template.sidecar.fileName));
check("sidecar target triple is recorded", typeof template.sidecar?.targetTriple === "string");
check("sidecar nodeRequired is recorded", typeof template.sidecar?.nodeRequired === "boolean");
check("sidecar manifest productionReady is not true", template.sidecar?.manifestProductionReady !== true);
check("self-contained draft check is boolean", typeof template.checks?.selfContainedDraftPresent === "boolean");
check("bundled runtime check is boolean", typeof template.checks?.bundledRuntimeRecorded === "boolean");
check("nodeRequired false check is boolean", typeof template.checks?.nodeRequiredFalse === "boolean");
check("release sidecar smoke check is boolean", typeof template.checks?.releaseSidecarSmokePassed === "boolean");
check("auth transport smoke check is boolean", typeof template.checks?.sidecarAuthTransportSmokePassed === "boolean");
check("installed health smoke check is boolean", typeof template.checks?.installedSidecarHealthSmokePassed === "boolean");
check("public listeners remain disallowed", template.checks?.publicSidecarListenersAllowed === false);
check("license review approval remains false", template.checks?.licenseReviewApproved === false);
check("sidecar evidence is present", evidence.length >= 4);
check("all evidence uses relative file names", evidence.every((item) => typeof item.fileName === "string" && !/[\\/]/u.test(item.fileName)));
check("existing evidence has hashes", evidence.filter((item) => item.exists === true).every((item) => typeof item.sha256 === "string"));
check("evidence does not claim production ready", evidence.every((item) => item.productionReady !== true));
check("reviewer name starts empty", template.reviewer?.name === null);
check("reviewer completedAt starts empty", template.reviewer?.completedAt === null);
check("reviewer decision starts pending", template.reviewer?.decision === "pending");
check("token redaction asserted", template.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", template.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", template.securityAssertions?.rawLogsExcluded === true);
check("raw stdout/stderr excluded", template.securityAssertions?.rawStdoutStderrExcluded === true);
check("command lines excluded", template.securityAssertions?.commandLinesExcluded === true);
check("stack traces excluded", template.securityAssertions?.stackTracesExcluded === true);
check("security assertion public sidecar listeners disallowed", template.securityAssertions?.publicSidecarListenersAllowed === false);

if (process.exitCode === 1) {
  console.error("Windows sidecar production readiness template verification failed");
  process.exit(1);
}

console.log("Windows sidecar production readiness template verification passed");
