import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

interface Blocker {
  code: string;
  source: "sidecar" | "release_readiness" | "rc_gate" | "release_policy" | "manual_gui_qa";
  reason: string;
  requiredForRc: true;
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const outputPath = resolve(releaseDir, "lumatrace-windows-rc-status.json");

function readJsonIfExists(path: string): JsonObject | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function objectField(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && value !== undefined && !Array.isArray(value) && typeof value === "object"
    ? value
    : undefined;
}

function arrayField(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function stringField(object: JsonObject | undefined, key: string, fallback = "unknown"): string {
  return typeof object?.[key] === "string" ? object[key] : fallback;
}

function addBlocker(blockers: Blocker[], blocker: Blocker): void {
  if (!blockers.some((entry) => entry.code === blocker.code && entry.source === blocker.source)) {
    blockers.push(blocker);
  }
}

function gateStatusBucket(status: string | undefined): "passed" | "blocked" | "missing" | "unknown" {
  if (status === undefined) {
    return "missing";
  }
  if (/^(passed|ready|complete|ok)$/iu.test(status)) {
    return "passed";
  }
  if (/^(blocked|failed|not_ready|draft_blocked)$/iu.test(status)) {
    return "blocked";
  }
  if (/^(missing|missing_result)$/iu.test(status)) {
    return "missing";
  }
  return "unknown";
}

function sourceForBlocker(code: string): Blocker["source"] {
  if (/MANUAL_GUI_QA/u.test(code)) {
    return "manual_gui_qa";
  }
  if (/CODE_SIGNING|UPDATER|RELEASE_APPROVAL|LICENSE_NOTICE|LICENSE_REVIEW/u.test(code)) {
    return "release_policy";
  }
  if (/SIDECAR/u.test(code)) {
    return "sidecar";
  }
  return "rc_gate";
}

const sidecarManifestPath = resolve(binariesDir, "sidecar-manifest.json");
const releaseReadinessPath = resolve(releaseDir, "lumatrace-windows-packaging-release-readiness.json");
const rcGatePath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");
const releasePolicyPath = resolve(releaseDir, "lumatrace-windows-release-policy-template.json");
const manualGuiQaHandoffPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-handoff-manifest.json");
const manualGuiQaResultPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json");

const sidecarManifest = readJsonIfExists(sidecarManifestPath);
const releaseReadiness = readJsonIfExists(releaseReadinessPath);
const rcGate = readJsonIfExists(rcGatePath);
const releasePolicy = readJsonIfExists(releasePolicyPath);
const manualGuiQaHandoff = readJsonIfExists(manualGuiQaHandoffPath);
const manualGuiQaResult = readJsonIfExists(manualGuiQaResultPath);

const gates = arrayField(rcGate?.gates).map((entry) => objectField(entry)).filter((entry): entry is JsonObject => entry !== undefined);
const blockers: Blocker[] = [];

if (sidecarManifest === undefined) {
  addBlocker(blockers, {
    code: "SIDECAR_MANIFEST_MISSING",
    source: "sidecar",
    reason: "Sidecar manifest is missing.",
    requiredForRc: true
  });
} else {
  if (sidecarManifest.artifactKind !== "self-contained") {
    addBlocker(blockers, {
      code: "SIDECAR_NOT_SELF_CONTAINED",
      source: "sidecar",
      reason: "Sidecar artifact is not a self-contained draft.",
      requiredForRc: true
    });
  }
  if (sidecarManifest.productionReady !== true) {
    addBlocker(blockers, {
      code: "SIDECAR_PRODUCTION_READY_FALSE",
      source: "sidecar",
      reason: "Sidecar manifest still records productionReady=false.",
      requiredForRc: true
    });
  }
  if (sidecarManifest.licenseReviewStatus !== "complete") {
    addBlocker(blockers, {
      code: "LICENSE_NOTICE_REVIEW_NOT_COMPLETE",
      source: "release_policy",
      reason: "Bundled runtime and third-party notices still require release review.",
      requiredForRc: true
    });
  }
}

if (releaseReadiness === undefined) {
  addBlocker(blockers, {
    code: "RELEASE_READINESS_MISSING",
    source: "release_readiness",
    reason: "Release readiness manifest is missing.",
    requiredForRc: true
  });
}
if (releasePolicy === undefined) {
  addBlocker(blockers, {
    code: "RELEASE_POLICY_MISSING",
    source: "release_policy",
    reason: "Release policy template is missing.",
    requiredForRc: true
  });
}
if (manualGuiQaHandoff === undefined) {
  addBlocker(blockers, {
    code: "MANUAL_GUI_QA_HANDOFF_MISSING",
    source: "manual_gui_qa",
    reason: "Manual GUI QA handoff manifest is missing.",
    requiredForRc: true
  });
}
if (manualGuiQaResult === undefined || manualGuiQaResult.status !== "passed") {
  addBlocker(blockers, {
    code: "MANUAL_GUI_QA_RESULT_NOT_PASSED",
    source: "manual_gui_qa",
    reason: "Manual GUI QA result is missing or has not passed verification.",
    requiredForRc: true
  });
}

for (const blocker of arrayField(rcGate?.blockers)) {
  const object = objectField(blocker);
  if (typeof object?.code === "string") {
    addBlocker(blockers, {
      code: object.code,
      source: sourceForBlocker(object.code),
      reason: typeof object.reason === "string" ? object.reason : "Gate has not passed.",
      requiredForRc: true
    });
  }
}

const gateCounts = gates.reduce(
  (counts, gate) => {
    const bucket = gateStatusBucket(typeof gate.status === "string" ? gate.status : undefined);
    counts[bucket] += 1;
    counts.total += 1;
    return counts;
  },
  { total: 0, passed: 0, blocked: 0, missing: 0, unknown: 0 }
);

const missingEvidence =
  sidecarManifest === undefined ||
  releaseReadiness === undefined ||
  rcGate === undefined ||
  releasePolicy === undefined ||
  manualGuiQaHandoff === undefined;
const rcCandidateReady =
  blockers.length === 0 &&
  rcGate?.rcCandidateReady === true &&
  releasePolicy?.rcCandidateReady === true &&
  releaseReadiness?.releaseStatus !== "blocked";
const status = missingEvidence ? "missing_evidence" : rcCandidateReady ? "ready_for_rc_review" : "blocked";

const nextActions = [
  "Run or import a validated Windows manual GUI QA result.",
  "Complete sidecar production readiness and bundled notice/license review.",
  "Configure and verify Windows code signing or keep it explicitly blocked.",
  "Decide updater policy and verify the updater-policy result.",
  "Record final release approval only after every other gate is complete."
];

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-rc-status",
  status,
  rcCandidateReady,
  productionReady: false,
  unsignedDraft: true,
  windowsRcStatus: {
    status,
    rcCandidateReady,
    productionReady: false,
    evidence: {
      sidecarManifestValid: sidecarManifest !== undefined,
      artifactKind: stringField(sidecarManifest, "artifactKind"),
      selfContainedSidecar: sidecarManifest?.artifactKind === "self-contained",
      sidecarProductionReady: sidecarManifest?.productionReady === true,
      licenseReviewStatus: stringField(sidecarManifest, "licenseReviewStatus"),
      releaseReadinessValid: releaseReadiness !== undefined,
      rcGateValid: rcGate !== undefined,
      releasePolicyValid: releasePolicy !== undefined,
      manualGuiQaHandoffValid: manualGuiQaHandoff !== undefined,
      manualGuiQaResultValid: manualGuiQaResult?.status === "passed",
      manualGuiQaResultStatus: stringField(manualGuiQaResult, "status", manualGuiQaResult === undefined ? "missing" : "invalid")
    },
    gateCounts,
    blockers,
    nextActions,
    warnings: [
      "Windows RC status is a sanitized planning summary, not release approval.",
      "productionReady remains false until signing, updater policy, license review, manual QA, and release approval are complete."
    ]
  },
  sourceFiles: {
    sidecarManifest: "sidecar-manifest.json",
    releaseReadiness: "lumatrace-windows-packaging-release-readiness.json",
    rcGate: "lumatrace-windows-packaging-rc-gate.json",
    releasePolicy: "lumatrace-windows-release-policy-template.json",
    manualGuiQaHandoff: "lumatrace-windows-manual-gui-qa-handoff-manifest.json",
    manualGuiQaResult: "lumatrace-windows-manual-gui-qa-result.json"
  },
  fileMetadata: {
    ...(existsSync(sidecarManifestPath) ? { sidecarManifestSizeBytes: statSync(sidecarManifestPath).size } : {}),
    ...(existsSync(rcGatePath) ? { rcGateSizeBytes: statSync(rcGatePath).size } : {})
  },
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    rawStdoutStderrExcluded: true,
    reviewerNotesExcluded: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This is a sanitized RC planning summary generated from existing evidence manifests.",
    "It is not release approval and cannot remove any release blocker by itself.",
    "productionReady remains false until all required gate result files pass their dedicated verifiers."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Windows RC status written to ${outputPath}`);
console.log(`status=${status}`);
console.log(`blockers=${blockers.length}`);
