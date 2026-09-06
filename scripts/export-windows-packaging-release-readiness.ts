import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ArtifactSummary {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  status?: JsonValue;
  productionReady?: JsonValue;
  unsigned?: JsonValue;
}

interface ReadinessBlocker {
  code: string;
  reason: string;
  requiredForProduction: true;
}

interface WindowsPackagingReleaseReadiness {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-packaging-release-readiness";
  productionReady: false;
  releaseStatus: "blocked";
  qaDraftStatus: "automated_ready_manual_pending" | "manual_result_present_release_blocked" | "missing_required_artifacts";
  artifacts: {
    sidecarManifest: ArtifactSummary;
    packagingQaEvidence: ArtifactSummary;
    packagingNotices: ArtifactSummary;
    windowsBundleDraft: ArtifactSummary;
    windowsInstallerDraft: ArtifactSummary;
  };
  checks: {
    selfContainedSidecarPresent: boolean;
    productionSidecarReady: boolean;
    packagingQaEvidenceReady: boolean;
    manualGuiQaStatus?: JsonValue;
    codeSigningConfigured: false;
    updaterConfigured: false;
    storeDistributionConfigured: false;
  };
  blockers: ReadinessBlocker[];
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const outputPath = resolve(releaseDir, "lumatrace-windows-packaging-release-readiness.json");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): Record<string, JsonValue> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, JsonValue>;
}

function field(document: Record<string, JsonValue>, name: string): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(document, name) ? document[name] : undefined;
}

function summarize(path: string, fileName: string): ArtifactSummary {
  if (!existsSync(path)) {
    return { fileName, exists: false };
  }

  const document = readJson(path);
  return {
    fileName,
    exists: true,
    sha256: sha256(path),
    sizeBytes: statSync(path).size,
    status: field(document, "status"),
    productionReady: field(document, "productionReady"),
    unsigned: field(document, "unsigned")
  };
}

const sidecarManifest = summarize(resolve(binariesDir, "sidecar-manifest.json"), "sidecar-manifest.json");
const packagingQaEvidence = summarize(
  resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json"),
  "lumatrace-windows-packaging-qa-evidence.json"
);
const packagingNotices = summarize(resolve(binariesDir, "packaging-notices.json"), "packaging-notices.json");
const windowsBundleDraft = summarize(
  resolve(releaseDir, "lumatrace-bundle-draft-manifest.json"),
  "lumatrace-bundle-draft-manifest.json"
);
const windowsInstallerDraft = summarize(
  resolve(releaseDir, "lumatrace-installer-draft-manifest.json"),
  "lumatrace-installer-draft-manifest.json"
);

const sidecarDocument = sidecarManifest.exists ? readJson(resolve(binariesDir, "sidecar-manifest.json")) : {};
const qaEvidenceDocument = packagingQaEvidence.exists
  ? readJson(resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json"))
  : {};
const manualGuiQa =
  qaEvidenceDocument.manualGuiQa !== null &&
  !Array.isArray(qaEvidenceDocument.manualGuiQa) &&
  typeof qaEvidenceDocument.manualGuiQa === "object"
    ? qaEvidenceDocument.manualGuiQa
    : {};
const manualGuiQaStatus = field(manualGuiQa, "status");
const selfContainedSidecarPresent = sidecarDocument.artifactKind === "self-contained";
const productionSidecarReady = sidecarDocument.productionReady === true;
const packagingQaEvidenceReady = packagingQaEvidence.status === "automated_evidence_ready";
const requiredArtifacts = [sidecarManifest, packagingQaEvidence, packagingNotices, windowsBundleDraft, windowsInstallerDraft];
const requiredArtifactsPresent = requiredArtifacts.every((artifact) => artifact.exists);
const blockers: ReadinessBlocker[] = [];

if (!requiredArtifactsPresent) {
  blockers.push({
    code: "MISSING_REQUIRED_ARTIFACTS",
    reason: "One or more Windows packaging draft manifests or notice files are missing.",
    requiredForProduction: true
  });
}

if (manualGuiQaStatus !== "result_passed") {
  blockers.push({
    code: "MANUAL_GUI_QA_NOT_PASSED",
    reason: "Manual installed-app GUI QA is not represented by a validated passed result.",
    requiredForProduction: true
  });
}

if (!productionSidecarReady) {
  blockers.push({
    code: "SIDECAR_PRODUCTION_READY_FALSE",
    reason: "The sidecar manifest still records productionReady=false.",
    requiredForProduction: true
  });
}

blockers.push(
  {
    code: "CODE_SIGNING_NOT_CONFIGURED",
    reason: "Windows production code signing is not configured or verified.",
    requiredForProduction: true
  },
  {
    code: "UPDATER_NOT_CONFIGURED",
    reason: "Updater policy and update signing are not configured.",
    requiredForProduction: true
  },
  {
    code: "PRODUCTION_APPROVAL_NOT_GRANTED",
    reason: "Release approval is not complete; current artifacts are unsigned QA drafts.",
    requiredForProduction: true
  }
);

const readiness: WindowsPackagingReleaseReadiness = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-packaging-release-readiness",
  productionReady: false,
  releaseStatus: "blocked",
  qaDraftStatus: !requiredArtifactsPresent
    ? "missing_required_artifacts"
    : manualGuiQaStatus === "result_passed"
      ? "manual_result_present_release_blocked"
      : "automated_ready_manual_pending",
  artifacts: {
    sidecarManifest,
    packagingQaEvidence,
    packagingNotices,
    windowsBundleDraft,
    windowsInstallerDraft
  },
  checks: {
    selfContainedSidecarPresent,
    productionSidecarReady,
    packagingQaEvidenceReady,
    manualGuiQaStatus,
    codeSigningConfigured: false,
    updaterConfigured: false,
    storeDistributionConfigured: false
  },
  blockers,
  limitations: [
    "This is a Windows packaging release-readiness gate for unsigned QA drafts, not release approval.",
    "productionReady remains false until signing, updater policy, manual GUI QA, license review, installer QA, and release approval are complete.",
    "The manifest records artifact file names, hashes, sizes, booleans, and blocker codes only; it does not include tokens, local paths, raw logs, command lines, or stack traces.",
    "No cloud upload, updater, store distribution, notarization, or new metrics are added by this gate."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(readiness, null, 2)}\n`, "utf8");

console.log(`Windows packaging release readiness written to ${outputPath}`);
console.log(`releaseStatus=${readiness.releaseStatus}`);
console.log(`qaDraftStatus=${readiness.qaDraftStatus}`);
