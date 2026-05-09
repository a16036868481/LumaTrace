import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface SidecarEvidence {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  status?: JsonValue;
  passed?: JsonValue;
  publicListenerCount?: JsonValue;
  productionReady?: JsonValue;
}

interface WindowsSidecarProductionReadinessTemplate {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-sidecar-production-readiness-template";
  status: "draft_requires_review";
  approved: false;
  productionReady: false;
  unsignedDraft: true;
  sidecar: {
    manifestFile: "sidecar-manifest.json";
    artifactKind?: JsonValue;
    fileName?: JsonValue;
    targetTriple?: JsonValue;
    sha256?: JsonValue;
    sizeBytes?: JsonValue;
    nodeRequired?: JsonValue;
    runtimeDirectory?: JsonValue;
    runtimeSizeBytes?: JsonValue;
    runtimeFileCount?: JsonValue;
    bundledNodeVersion?: JsonValue;
    licenseReviewStatus?: JsonValue;
    manifestProductionReady?: JsonValue;
  };
  checks: {
    selfContainedDraftPresent: boolean;
    bundledRuntimeRecorded: boolean;
    nodeRequiredFalse: boolean;
    releaseSidecarSmokePassed: boolean;
    sidecarAuthTransportSmokePassed: boolean;
    installedSidecarHealthSmokePassed: boolean;
    publicSidecarListenersAllowed: false;
    licenseReviewApproved: false;
  };
  evidence: SidecarEvidence[];
  reviewer: {
    name: null;
    completedAt: null;
    decision: "pending";
  };
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    rawStdoutStderrExcluded: true;
    commandLinesExcluded: true;
    stackTracesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  completionRules: string[];
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const outputPath = resolve(releaseDir, "lumatrace-windows-sidecar-production-readiness-template.json");
const sidecarManifestPath = resolve(binariesDir, "sidecar-manifest.json");

const evidenceFiles = [
  "lumatrace-tauri-sidecar-auth-transport-smoke-manifest.json",
  "lumatrace-installed-sidecar-health-smoke-manifest.json",
  "lumatrace-windows-packaging-smoke-suite-manifest.json",
  "lumatrace-bundle-draft-manifest.json",
  "lumatrace-installer-draft-manifest.json"
] as const;

function sha256(path: string): string | undefined {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : undefined;
}

function readJson(path: string): Record<string, JsonValue> {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, JsonValue>) : {};
}

function field(document: Record<string, JsonValue>, name: string): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(document, name) ? document[name] : undefined;
}

function summarizeEvidence(fileName: string): SidecarEvidence {
  const path = resolve(releaseDir, fileName);
  if (!existsSync(path)) {
    return { fileName, exists: false };
  }
  const document = readJson(path);
  return {
    fileName,
    exists: true,
    sha256: sha256(path),
    sizeBytes: statSync(path).size,
    ...(field(document, "status") === undefined ? {} : { status: field(document, "status") }),
    ...(field(document, "passed") === undefined ? {} : { passed: field(document, "passed") }),
    ...(field(document, "publicListenerCount") === undefined
      ? {}
      : { publicListenerCount: field(document, "publicListenerCount") }),
    ...(field(document, "productionReady") === undefined ? {} : { productionReady: field(document, "productionReady") })
  };
}

const sidecarManifest = readJson(sidecarManifestPath);
const evidence = evidenceFiles.map((fileName) => summarizeEvidence(fileName));
const releaseSidecarSmoke = evidence.find(
  (item) => item.fileName === "lumatrace-windows-packaging-smoke-suite-manifest.json"
);
const sidecarAuthSmoke = evidence.find(
  (item) => item.fileName === "lumatrace-tauri-sidecar-auth-transport-smoke-manifest.json"
);
const installedHealthSmoke = evidence.find(
  (item) => item.fileName === "lumatrace-installed-sidecar-health-smoke-manifest.json"
);

const template: WindowsSidecarProductionReadinessTemplate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-sidecar-production-readiness-template",
  status: "draft_requires_review",
  approved: false,
  productionReady: false,
  unsignedDraft: true,
  sidecar: {
    manifestFile: "sidecar-manifest.json",
    ...(field(sidecarManifest, "artifactKind") === undefined ? {} : { artifactKind: field(sidecarManifest, "artifactKind") }),
    ...(field(sidecarManifest, "fileName") === undefined ? {} : { fileName: field(sidecarManifest, "fileName") }),
    ...(field(sidecarManifest, "targetTriple") === undefined ? {} : { targetTriple: field(sidecarManifest, "targetTriple") }),
    ...(field(sidecarManifest, "sha256") === undefined ? {} : { sha256: field(sidecarManifest, "sha256") }),
    ...(field(sidecarManifest, "sizeBytes") === undefined ? {} : { sizeBytes: field(sidecarManifest, "sizeBytes") }),
    ...(field(sidecarManifest, "nodeRequired") === undefined ? {} : { nodeRequired: field(sidecarManifest, "nodeRequired") }),
    ...(field(sidecarManifest, "runtimeDirectory") === undefined
      ? {}
      : { runtimeDirectory: field(sidecarManifest, "runtimeDirectory") }),
    ...(field(sidecarManifest, "runtimeSizeBytes") === undefined
      ? {}
      : { runtimeSizeBytes: field(sidecarManifest, "runtimeSizeBytes") }),
    ...(field(sidecarManifest, "runtimeFileCount") === undefined
      ? {}
      : { runtimeFileCount: field(sidecarManifest, "runtimeFileCount") }),
    ...(field(sidecarManifest, "bundledNodeVersion") === undefined
      ? {}
      : { bundledNodeVersion: field(sidecarManifest, "bundledNodeVersion") }),
    ...(field(sidecarManifest, "licenseReviewStatus") === undefined
      ? {}
      : { licenseReviewStatus: field(sidecarManifest, "licenseReviewStatus") }),
    ...(field(sidecarManifest, "productionReady") === undefined
      ? {}
      : { manifestProductionReady: field(sidecarManifest, "productionReady") })
  },
  checks: {
    selfContainedDraftPresent: sidecarManifest.artifactKind === "self-contained",
    bundledRuntimeRecorded:
      typeof sidecarManifest.runtimeDirectory === "string" && typeof sidecarManifest.runtimeSizeBytes === "number",
    nodeRequiredFalse: sidecarManifest.nodeRequired === false,
    releaseSidecarSmokePassed: releaseSidecarSmoke?.status === "success",
    sidecarAuthTransportSmokePassed: sidecarAuthSmoke?.status === "success" || sidecarAuthSmoke?.passed === true,
    installedSidecarHealthSmokePassed: installedHealthSmoke?.status === "success" || installedHealthSmoke?.passed === true,
    publicSidecarListenersAllowed: false,
    licenseReviewApproved: false
  },
  evidence,
  reviewer: {
    name: null,
    completedAt: null,
    decision: "pending"
  },
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    rawStdoutStderrExcluded: true,
    commandLinesExcluded: true,
    stackTracesExcluded: true,
    publicSidecarListenersAllowed: false
  },
  completionRules: [
    "Confirm the sidecar artifact is self-contained for the target platform and starts without a developer PATH.",
    "Confirm sidecar auth transport, installed sidecar health, packaged diagnostics, packaged storage, and crash recovery smokes are reviewed.",
    "Confirm bundled runtime and dependency notices have approved license review before production readiness.",
    "Confirm no public listener, token leak, raw log export, command line leak, stack trace leak, or full local path leak is present.",
    "Record approval in a separate reviewed release evidence file; this template starts unapproved."
  ],
  limitations: [
    "This is a sanitized sidecar production-readiness template, not approval.",
    "It does not sign the sidecar, configure an updater, approve licenses, or grant release approval.",
    "It contains relative file names, hashes, booleans, and sanitized metadata only.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`Windows sidecar production readiness template written to ${outputPath}`);
console.log(`status=${template.status}`);
console.log(`evidence=${String(template.evidence.length)}`);
