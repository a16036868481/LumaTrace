import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

interface ReviewerBundleFile {
  role?: unknown;
  fileName?: unknown;
  sha256?: unknown;
  sizeBytes?: unknown;
  productionReady?: unknown;
}

interface WindowsRcReviewerBundle {
  evidenceKind?: unknown;
  status?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  bundleDirectory?: unknown;
  files?: ReviewerBundleFile[];
  blockers?: unknown[];
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

interface RcGateManifest {
  gates?: Array<{
    id?: unknown;
    status?: unknown;
  }>;
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const bundleDir = resolve(releaseDir, "lumatrace-windows-rc-reviewer-bundle");
const manifestPath = resolve(releaseDir, "lumatrace-windows-rc-reviewer-bundle-manifest.json");

const requiredFiles = [
  "README.md",
  "lumatrace-windows-packaging-qa-evidence.json",
  "lumatrace-windows-packaging-release-readiness.json",
  "lumatrace-windows-packaging-rc-gate.json",
  "lumatrace-windows-release-policy-template.json",
  "lumatrace-windows-sidecar-production-readiness-template.json",
  "lumatrace-windows-license-review-template.json",
  "lumatrace-windows-code-signing-readiness-template.json",
  "lumatrace-windows-updater-policy-readiness-template.json",
  "lumatrace-windows-release-approval-readiness-template.json",
  "lumatrace-windows-manual-gui-qa-template.json",
  "lumatrace-windows-manual-gui-qa-handoff-manifest.json",
  "sidecar-manifest.json",
  "packaging-notices.json"
] as const;

const requiredBlockers = [] as const;

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

check("RC reviewer bundle manifest exists", existsSync(manifestPath));
check("RC reviewer bundle directory exists", existsSync(bundleDir));
if (!existsSync(manifestPath) || !existsSync(bundleDir)) {
  process.exit(1);
}

const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText) as WindowsRcReviewerBundle;
const files = manifest.files ?? [];
const fileByName = new Map(
  files
    .filter((file) => typeof file.fileName === "string")
    .map((file) => [file.fileName as string, file])
);
const blockers = new Set(
  (manifest.blockers ?? []).filter((blocker): blocker is string => typeof blocker === "string")
);

check("RC reviewer bundle manifest is sanitized", hasCleanText(manifestText));
check(
  "evidence kind is windows-rc-reviewer-bundle",
  manifest.evidenceKind === "windows-rc-reviewer-bundle"
);
check("bundle status is ready", manifest.status === "review_bundle_ready");
check("RC candidate remains false", manifest.rcCandidateReady === false);
check("productionReady remains false", manifest.productionReady === false);
check("unsigned draft remains explicit", manifest.unsignedDraft === true);
check(
  "bundle directory is relative",
  manifest.bundleDirectory === "lumatrace-windows-rc-reviewer-bundle"
);
check("token redaction asserted", manifest.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", manifest.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", manifest.securityAssertions?.rawLogsExcluded === true);
check("raw stdout/stderr excluded", manifest.securityAssertions?.rawStdoutStderrExcluded === true);
check("raw license text excluded", manifest.securityAssertions?.rawLicenseTextExcluded === true);
check("reviewer notes excluded", manifest.securityAssertions?.reviewerNotesExcluded === true);
check(
  "public sidecar listeners disallowed",
  manifest.securityAssertions?.publicSidecarListenersAllowed === false
);

for (const blocker of requiredBlockers) {
  check(`blocker retained: ${blocker}`, blockers.has(blocker));
}

const rcGatePath = resolve(bundleDir, "lumatrace-windows-packaging-rc-gate.json");
if (existsSync(rcGatePath)) {
  const rcGate = JSON.parse(readFileSync(rcGatePath, "utf8")) as RcGateManifest;
  const sidecarGate = (rcGate.gates ?? []).find(
    (gate) => gate.id === "sidecar_production_readiness"
  );
  const manualGate = (rcGate.gates ?? []).find((gate) => gate.id === "manual_gui_qa");
  const licenseGate = (rcGate.gates ?? []).find((gate) => gate.id === "license_notice_review");
  const codeSigningGate = (rcGate.gates ?? []).find((gate) => gate.id === "code_signing");
  const updaterGate = (rcGate.gates ?? []).find((gate) => gate.id === "updater_policy");
  const releaseApprovalGate = (rcGate.gates ?? []).find((gate) => gate.id === "release_approval");
  if (sidecarGate?.status === "passed") {
    check(
      "sidecar production readiness blocker absent after approved result",
      !blockers.has("SIDECAR_PRODUCTION_READINESS")
    );
  } else {
    check(
      "sidecar production readiness blocker retained without approved result",
      blockers.has("SIDECAR_PRODUCTION_READINESS")
    );
  }
  if (manualGate?.status === "passed") {
    check("manual GUI QA blocker absent after passed result", !blockers.has("MANUAL_GUI_QA"));
  } else {
    check("manual GUI QA blocker retained without passed result", blockers.has("MANUAL_GUI_QA"));
  }
  if (licenseGate?.status === "passed") {
    check(
      "license review blocker absent after approved result",
      !blockers.has("LICENSE_NOTICE_REVIEW")
    );
  } else {
    check(
      "license review blocker retained without approved result",
      blockers.has("LICENSE_NOTICE_REVIEW")
    );
  }
  if (codeSigningGate?.status === "passed") {
    check("code signing blocker absent after configured result", !blockers.has("CODE_SIGNING"));
  } else {
    check("code signing blocker retained without configured result", blockers.has("CODE_SIGNING"));
  }
  if (updaterGate?.status === "passed") {
    check("updater policy blocker absent after policy result", !blockers.has("UPDATER_POLICY"));
  } else {
    check("updater policy blocker retained without policy result", blockers.has("UPDATER_POLICY"));
  }
  if (releaseApprovalGate?.status === "passed") {
    check(
      "release approval blocker absent after approved result",
      !blockers.has("RELEASE_APPROVAL")
    );
  } else {
    check(
      "release approval blocker retained without approved result",
      blockers.has("RELEASE_APPROVAL")
    );
  }
}

check(
  "raw third-party notice text is excluded",
  (manifest.excludedFiles ?? []).some((value) => value === "raw license text") &&
    !requiredFiles.includes("THIRD-PARTY-NOTICES.md" as (typeof requiredFiles)[number])
);

for (const fileName of requiredFiles) {
  const path = resolve(bundleDir, fileName);
  const entry = fileByName.get(fileName);
  check(`bundle file exists: ${fileName}`, existsSync(path));
  check(`bundle manifest includes: ${fileName}`, entry !== undefined);
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    check(`bundle file is sanitized: ${fileName}`, hasCleanText(text));
    if (entry !== undefined) {
      check(`bundle hash matches: ${fileName}`, entry.sha256 === sha256(path));
      check(`bundle size matches: ${fileName}`, entry.sizeBytes === statSync(path).size);
      check(
        `bundle file does not claim production ready: ${fileName}`,
        entry.productionReady !== true
      );
    }
  }
}

const readme = readFileSync(resolve(bundleDir, "README.md"), "utf8");
check("README says not release approval", /not release approval/i.test(readme));
check("README says productionReady false", /productionReady:\s*false/i.test(readme));
check("README says raw license text excluded", /raw license text/i.test(readme));

if (process.exitCode === 1) {
  console.error("Windows RC reviewer bundle verification failed");
  process.exit(1);
}

console.log("Windows RC reviewer bundle verification passed");
