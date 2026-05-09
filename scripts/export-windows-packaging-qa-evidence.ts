import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface EvidenceManifestSummary {
  name: string;
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  generatedAt?: JsonValue;
  status?: JsonValue;
  bundleKind?: JsonValue;
  smokeKind?: JsonValue;
  productionReady?: JsonValue;
  unsigned?: JsonValue;
  passed?: JsonValue;
}

interface WindowsPackagingQaEvidence {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-packaging-qa-evidence";
  status: "automated_evidence_ready" | "missing_required_artifacts";
  productionReady: false;
  unsignedDraft: true;
  automatedEvidence: {
    requiredManifests: EvidenceManifestSummary[];
    allRequiredPresent: boolean;
    smokeSuiteStatus?: JsonValue;
  };
  manualGuiQa: {
    status: "not_run" | "result_passed" | "result_failed" | "result_blocked" | "result_invalid";
    requiredBeforeRelease: boolean;
    checklistPath: "docs/windows-packaging-manual-gui-checklist.md";
    checklistSections: string[];
    checklistItemCount: number;
    result?: {
      fileName: "lumatrace-windows-manual-gui-qa-result.json";
      exists: boolean;
      sha256?: string;
      sizeBytes?: number;
      status?: JsonValue;
      reviewerPresent?: boolean;
      completedAtPresent?: boolean;
      environmentPresent?: boolean;
      passedSteps?: number;
      failedSteps?: number;
      blockedSteps?: number;
      validationStatus?: "valid" | "invalid";
    };
    note: string;
  };
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    stackTracesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const evidencePath = resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json");
const checklistPath = resolve(root, "docs/windows-packaging-manual-gui-checklist.md");
const manualResultPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json");

const requiredManifests = [
  { name: "Tauri sidecar auth transport smoke", fileName: "lumatrace-tauri-sidecar-auth-transport-smoke-manifest.json" },
  { name: "portable bundle draft", fileName: "lumatrace-bundle-draft-manifest.json" },
  { name: "installer draft", fileName: "lumatrace-installer-draft-manifest.json" },
  { name: "installer install/uninstall smoke", fileName: "lumatrace-installer-smoke-manifest.json" },
  { name: "installed app launch smoke", fileName: "lumatrace-installed-app-launch-smoke-manifest.json" },
  { name: "installed sidecar health smoke", fileName: "lumatrace-installed-sidecar-health-smoke-manifest.json" },
  { name: "windows packaging smoke suite", fileName: "lumatrace-windows-packaging-smoke-suite-manifest.json" }
] as const;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): Record<string, JsonValue> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, JsonValue>;
}

function getField(manifest: Record<string, JsonValue>, field: string): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(manifest, field) ? manifest[field] : undefined;
}

function summarizeManifest(name: string, fileName: string): EvidenceManifestSummary {
  const path = resolve(releaseDir, fileName);
  if (!existsSync(path)) {
    return { name, fileName, exists: false };
  }

  const manifest = readJson(path);
  return {
    name,
    fileName,
    exists: true,
    sha256: sha256(path),
    sizeBytes: statSync(path).size,
    generatedAt: getField(manifest, "generatedAt"),
    status: getField(manifest, "status"),
    bundleKind: getField(manifest, "bundleKind"),
    smokeKind: getField(manifest, "smokeKind"),
    productionReady: getField(manifest, "productionReady"),
    unsigned: getField(manifest, "unsigned"),
    passed: getField(manifest, "passed")
  };
}

function parseChecklist(): { sections: string[]; itemCount: number } {
  if (!existsSync(checklistPath)) {
    return { sections: [], itemCount: 0 };
  }
  const text = readFileSync(checklistPath, "utf8");
  const sections = text
    .split(/\r?\n/u)
    .filter((line) => /^##\s+/u.test(line))
    .map((line) => line.replace(/^##\s+/u, "").trim())
    .filter((line) => line.length > 0);
  const itemCount = text.split(/\r?\n/u).filter((line) => /^-\s+/u.test(line)).length;
  return { sections, itemCount };
}

function hasSuccessfulSmokeSuite(summaries: EvidenceManifestSummary[]): JsonValue | undefined {
  return summaries.find((summary) => summary.fileName === "lumatrace-windows-packaging-smoke-suite-manifest.json")?.status;
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

function hasText(value: JsonValue | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function countStepsByStatus(steps: JsonValue[] | undefined, status: string): number {
  return (steps ?? []).filter((step) => {
    if (step === null || Array.isArray(step) || typeof step !== "object") {
      return false;
    }
    return step.status === status;
  }).length;
}

function summarizeManualResult(checklistItemCount: number): WindowsPackagingQaEvidence["manualGuiQa"]["result"] {
  if (!existsSync(manualResultPath)) {
    return {
      fileName: "lumatrace-windows-manual-gui-qa-result.json",
      exists: false
    };
  }

  const text = readFileSync(manualResultPath, "utf8");
  const result = JSON.parse(text) as Record<string, JsonValue>;
  const steps = Array.isArray(result.steps) ? result.steps : undefined;
  const reviewer = result.reviewer;
  const reviewerObject: Record<string, JsonValue> =
    reviewer !== null && !Array.isArray(reviewer) && typeof reviewer === "object" ? reviewer : {};
  const passedSteps = countStepsByStatus(steps, "passed");
  const failedSteps = countStepsByStatus(steps, "failed");
  const blockedSteps = countStepsByStatus(steps, "blocked");
  const finalStepCount = passedSteps + failedSteps + blockedSteps;
  const expectedStatus = failedSteps > 0 ? "failed" : blockedSteps > 0 ? "blocked" : "passed";
  const validationStatus =
    result.evidenceKind === "windows-manual-gui-qa-result" &&
    result.productionReady === false &&
    result.unsignedDraft === true &&
    hasCleanText(text) &&
    steps !== undefined &&
    finalStepCount === checklistItemCount &&
    result.status === expectedStatus &&
    hasText(reviewerObject.name) &&
    hasText(reviewerObject.completedAt) &&
    hasText(reviewerObject.environment)
      ? "valid"
      : "invalid";

  return {
    fileName: "lumatrace-windows-manual-gui-qa-result.json",
    exists: true,
    sha256: sha256(manualResultPath),
    sizeBytes: statSync(manualResultPath).size,
    status: getField(result, "status"),
    reviewerPresent: hasText(reviewerObject.name),
    completedAtPresent: hasText(reviewerObject.completedAt),
    environmentPresent: hasText(reviewerObject.environment),
    passedSteps,
    failedSteps,
    blockedSteps,
    validationStatus
  };
}

function manualGuiStatus(
  result: WindowsPackagingQaEvidence["manualGuiQa"]["result"]
): WindowsPackagingQaEvidence["manualGuiQa"]["status"] {
  if (result === undefined || !result.exists) {
    return "not_run";
  }
  if (result.validationStatus !== "valid") {
    return "result_invalid";
  }
  if (result.status === "failed") {
    return "result_failed";
  }
  if (result.status === "blocked") {
    return "result_blocked";
  }
  return "result_passed";
}

const summaries = requiredManifests.map((manifest) => summarizeManifest(manifest.name, manifest.fileName));
const allRequiredPresent = summaries.every((summary) => summary.exists);
const smokeSuiteStatus = hasSuccessfulSmokeSuite(summaries);
const checklist = parseChecklist();
const manualResult = summarizeManualResult(checklist.itemCount);
const manualStatus = manualGuiStatus(manualResult);

const evidence: WindowsPackagingQaEvidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-packaging-qa-evidence",
  status: allRequiredPresent && smokeSuiteStatus === "success" ? "automated_evidence_ready" : "missing_required_artifacts",
  productionReady: false,
  unsignedDraft: true,
  automatedEvidence: {
    requiredManifests: summaries,
    allRequiredPresent,
    smokeSuiteStatus
  },
  manualGuiQa: {
    status: manualStatus,
    requiredBeforeRelease: manualStatus !== "result_passed",
    checklistPath: "docs/windows-packaging-manual-gui-checklist.md",
    checklistSections: checklist.sections,
    checklistItemCount: checklist.itemCount,
    result: manualResult,
    note:
      manualStatus === "not_run"
        ? "This evidence manifest aggregates automated Windows packaging smoke results only. Manual GUI QA must be run separately and is not marked as passed by this script."
        : "This evidence manifest includes only a sanitized summary of the manual GUI QA result. It does not include reviewer notes, raw logs, tokens, local paths, or production release approval."
  },
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    stackTracesExcluded: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This is an unsigned Windows packaging QA evidence manifest, not release approval.",
    "Manual GUI QA is intentionally recorded as not_run until a human completes the checklist.",
    "Code signing, updater validation, store distribution, notarization, and production release approval are not complete.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(`Windows packaging QA evidence written to ${evidencePath}`);
console.log(`status=${evidence.status}`);
