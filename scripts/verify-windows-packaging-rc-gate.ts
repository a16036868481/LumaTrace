import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Gate {
  id?: unknown;
  status?: unknown;
  requiredForRelease?: unknown;
  evidence?: {
    fileName?: unknown;
  };
}

interface Blocker {
  code?: unknown;
  requiredForRelease?: unknown;
}

interface RcGateManifest {
  evidenceKind?: unknown;
  status?: unknown;
  rcCandidateReady?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  gates?: Gate[];
  blockers?: Blocker[];
  policy?: {
    codeSigningConfigured?: unknown;
    updaterConfigured?: unknown;
    storeDistributionConfigured?: unknown;
    productionApprovalGranted?: unknown;
  };
}

const root = process.cwd();
const rcGatePath = resolve(
  root,
  "apps/desktop/src-tauri/target/release/lumatrace-windows-packaging-rc-gate.json"
);
const requiredBlockedGates = [] as const;

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

check("Windows packaging RC gate manifest exists", existsSync(rcGatePath));
if (!existsSync(rcGatePath)) {
  process.exit(1);
}

const text = readFileSync(rcGatePath, "utf8");
const manifest = JSON.parse(text) as RcGateManifest;
const gates = manifest.gates ?? [];
const gateById = new Map(gates.map((gate) => [gate.id, gate]));
const blockerCodes = new Set(
  (manifest.blockers ?? [])
    .map((blocker) => blocker.code)
    .filter((code): code is string => typeof code === "string")
);

check("RC gate manifest is sanitized", hasCleanText(text));
check(
  "evidence kind is windows-packaging-rc-gate",
  manifest.evidenceKind === "windows-packaging-rc-gate"
);
check("RC gate status remains blocked", manifest.status === "blocked");
check("RC candidate is not ready", manifest.rcCandidateReady === false);
check("productionReady remains false", manifest.productionReady === false);
check("unsigned draft remains explicit", manifest.unsignedDraft === true);
check("policy store distribution is false", manifest.policy?.storeDistributionConfigured === false);
check(
  "all gates are release gates",
  gates.length > 0 && gates.every((gate) => gate.requiredForRelease === true)
);
check(
  "all blockers are release blockers",
  (manifest.blockers ?? []).every((blocker) => blocker.requiredForRelease === true)
);
check(
  "blockers are present when any gate is not passed",
  gates.every((gate) => gate.status === "passed") || (manifest.blockers ?? []).length > 0
);

for (const gateId of requiredBlockedGates) {
  const gate = gateById.get(gateId);
  check(`gate exists: ${gateId}`, gate !== undefined);
  check(`gate blocked: ${gateId}`, gate?.status === "blocked" || gate?.status === "missing");
  check(`blocker present: ${gateId}`, blockerCodes.has(gateId.toUpperCase()));
}

const sidecarReadinessGate = gateById.get("sidecar_production_readiness");
check("gate exists: sidecar_production_readiness", sidecarReadinessGate !== undefined);
if (sidecarReadinessGate?.status === "passed") {
  check(
    "sidecar production readiness blocker absent after approved result",
    !blockerCodes.has("SIDECAR_PRODUCTION_READINESS")
  );
  check(
    "sidecar production readiness gate references sidecar readiness result when passed",
    sidecarReadinessGate.evidence?.fileName ===
      "lumatrace-windows-sidecar-production-readiness-result.json"
  );
} else {
  check(
    "sidecar production readiness blocked or missing without approved result",
    sidecarReadinessGate?.status === "blocked" || sidecarReadinessGate?.status === "missing"
  );
  check(
    "sidecar production readiness blocker present without approved result",
    blockerCodes.has("SIDECAR_PRODUCTION_READINESS")
  );
  check(
    "sidecar production readiness gate references sidecar readiness template",
    sidecarReadinessGate?.evidence?.fileName ===
      "lumatrace-windows-sidecar-production-readiness-template.json"
  );
}

const manualGuiQaGate = gateById.get("manual_gui_qa");
check("gate exists: manual_gui_qa", manualGuiQaGate !== undefined);
if (manualGuiQaGate?.status === "passed") {
  check("manual GUI QA blocker absent after passed result", !blockerCodes.has("MANUAL_GUI_QA"));
} else {
  check(
    "manual GUI QA blocked or missing without passed result",
    manualGuiQaGate?.status === "blocked" || manualGuiQaGate?.status === "missing"
  );
  check("manual GUI QA blocker present without passed result", blockerCodes.has("MANUAL_GUI_QA"));
}

const licenseReviewGate = gateById.get("license_notice_review");
check("gate exists: license_notice_review", licenseReviewGate !== undefined);
if (licenseReviewGate?.status === "passed") {
  check(
    "license review blocker absent after approved result",
    !blockerCodes.has("LICENSE_NOTICE_REVIEW")
  );
  check(
    "license review gate references license review result when passed",
    licenseReviewGate.evidence?.fileName === "lumatrace-windows-license-review-result.json"
  );
} else {
  check(
    "license review blocked or missing without approved result",
    licenseReviewGate?.status === "blocked" || licenseReviewGate?.status === "missing"
  );
  check(
    "license review blocker present without approved result",
    blockerCodes.has("LICENSE_NOTICE_REVIEW")
  );
  check(
    "license review gate references license review template",
    licenseReviewGate?.evidence?.fileName === "lumatrace-windows-license-review-template.json"
  );
}

const codeSigningGate = gateById.get("code_signing");
check("gate exists: code_signing", codeSigningGate !== undefined);
if (codeSigningGate?.status === "passed") {
  check(
    "policy code signing is true after configured result",
    manifest.policy?.codeSigningConfigured === true
  );
  check("code signing blocker absent after configured result", !blockerCodes.has("CODE_SIGNING"));
  check(
    "code signing gate references code signing result when passed",
    codeSigningGate.evidence?.fileName === "lumatrace-windows-code-signing-readiness-result.json"
  );
} else {
  check(
    "policy code signing is false without configured result",
    manifest.policy?.codeSigningConfigured === false
  );
  check(
    "code signing blocked or missing without configured result",
    codeSigningGate?.status === "blocked" || codeSigningGate?.status === "missing"
  );
  check("code signing blocker present without configured result", blockerCodes.has("CODE_SIGNING"));
  check(
    "code signing gate references code signing readiness template",
    codeSigningGate?.evidence?.fileName ===
      "lumatrace-windows-code-signing-readiness-template.json"
  );
}

const updaterGate = gateById.get("updater_policy");
check("gate exists: updater_policy", updaterGate !== undefined);
if (updaterGate?.status === "passed") {
  check("policy updater is true after policy result", manifest.policy?.updaterConfigured === true);
  check("updater blocker absent after policy result", !blockerCodes.has("UPDATER_POLICY"));
  check(
    "updater gate references updater policy result when passed",
    updaterGate.evidence?.fileName === "lumatrace-windows-updater-policy-readiness-result.json"
  );
} else {
  check(
    "policy updater is false without policy result",
    manifest.policy?.updaterConfigured === false
  );
  check(
    "updater blocked or missing without policy result",
    updaterGate?.status === "blocked" || updaterGate?.status === "missing"
  );
  check("updater blocker present without policy result", blockerCodes.has("UPDATER_POLICY"));
  check(
    "updater gate references updater policy readiness template",
    updaterGate?.evidence?.fileName === "lumatrace-windows-updater-policy-readiness-template.json"
  );
}

check(
  "automated smoke gate passed or explicitly represented",
  gateById.get("automated_windows_packaging_smoke") !== undefined
);
check(
  "QA evidence gate passed or explicitly represented",
  gateById.get("packaging_qa_evidence") !== undefined
);
check("installer draft gate represented", gateById.get("installer_draft") !== undefined);
check(
  "self-contained sidecar gate represented",
  gateById.get("self_contained_sidecar") !== undefined
);
check(
  "release approval gate references release approval readiness template",
  gateById.get("release_approval")?.evidence?.fileName ===
    "lumatrace-windows-release-approval-readiness-template.json" ||
    gateById.get("release_approval")?.evidence?.fileName ===
      "lumatrace-windows-release-approval-readiness-result.json"
);

const releaseApprovalGate = gateById.get("release_approval");
check("gate exists: release_approval", releaseApprovalGate !== undefined);
if (releaseApprovalGate?.status === "passed") {
  check(
    "policy approval is true after release approval result",
    manifest.policy?.productionApprovalGranted === true
  );
  check(
    "release approval blocker absent after approved result",
    !blockerCodes.has("RELEASE_APPROVAL")
  );
  check(
    "release approval gate references release approval result when passed",
    releaseApprovalGate.evidence?.fileName ===
      "lumatrace-windows-release-approval-readiness-result.json"
  );
} else {
  check(
    "policy approval is false without release approval result",
    manifest.policy?.productionApprovalGranted === false
  );
  check(
    "release approval blocked or missing without approved result",
    releaseApprovalGate?.status === "blocked" || releaseApprovalGate?.status === "missing"
  );
  check(
    "release approval blocker present without approved result",
    blockerCodes.has("RELEASE_APPROVAL")
  );
  check(
    "release approval gate references release approval readiness template",
    releaseApprovalGate?.evidence?.fileName ===
      "lumatrace-windows-release-approval-readiness-template.json"
  );
}

if (process.exitCode === 1) {
  console.error("Windows packaging RC gate verification failed");
  process.exit(1);
}

console.log("Windows packaging RC gate verification passed");
