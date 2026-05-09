import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface Gate {
  id: string;
  label: string;
  status: "passed" | "blocked" | "missing";
  requiredForRelease: true;
  evidence?: {
    fileName: string;
    sha256?: string;
    sizeBytes?: number;
    status?: JsonValue;
  };
  reason?: string;
}

interface RcBlocker {
  code: string;
  gateId: string;
  reason: string;
  requiredForRelease: true;
}

interface RcGateManifest {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-packaging-rc-gate";
  status: "blocked";
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  gates: Gate[];
  blockers: RcBlocker[];
  policy: {
    codeSigningConfigured: boolean;
    updaterConfigured: boolean;
    storeDistributionConfigured: false;
    productionApprovalGranted: boolean;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const outputPath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): Record<string, JsonValue> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, JsonValue>;
}

function field(document: Record<string, JsonValue>, name: string): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(document, name) ? document[name] : undefined;
}

function evidence(path: string, fileName: string): Gate["evidence"] {
  if (!existsSync(path)) {
    return { fileName };
  }
  const document = readJson(path);
  return {
    fileName,
    sha256: sha256(path),
    sizeBytes: statSync(path).size,
    status: field(document, "status")
  };
}

function document(path: string): Record<string, JsonValue> {
  return existsSync(path) ? readJson(path) : {};
}

function objectField(value: JsonValue | undefined): Record<string, JsonValue> {
  return value !== null && value !== undefined && !Array.isArray(value) && typeof value === "object"
    ? value
    : {};
}

const sidecarPath = resolve(binariesDir, "sidecar-manifest.json");
const qaEvidencePath = resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json");
const smokeSuitePath = resolve(
  releaseDir,
  "lumatrace-windows-packaging-smoke-suite-manifest.json"
);
const installerDraftPath = resolve(releaseDir, "lumatrace-installer-draft-manifest.json");
const readinessPath = resolve(releaseDir, "lumatrace-windows-packaging-release-readiness.json");
const noticesPath = resolve(binariesDir, "packaging-notices.json");
const releasePolicyPath = resolve(releaseDir, "lumatrace-windows-release-policy-template.json");
const licenseReviewTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-license-review-template.json"
);
const licenseReviewResultPath = resolve(
  releaseDir,
  "lumatrace-windows-license-review-result.json"
);
const codeSigningTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-code-signing-readiness-template.json"
);
const codeSigningResultPath = resolve(
  releaseDir,
  "lumatrace-windows-code-signing-readiness-result.json"
);
const updaterTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-updater-policy-readiness-template.json"
);
const updaterResultPath = resolve(
  releaseDir,
  "lumatrace-windows-updater-policy-readiness-result.json"
);
const releaseApprovalTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-template.json"
);
const releaseApprovalResultPath = resolve(
  releaseDir,
  "lumatrace-windows-release-approval-readiness-result.json"
);
const sidecarReadinessTemplatePath = resolve(
  releaseDir,
  "lumatrace-windows-sidecar-production-readiness-template.json"
);
const sidecarReadinessResultPath = resolve(
  releaseDir,
  "lumatrace-windows-sidecar-production-readiness-result.json"
);

const sidecar = document(sidecarPath);
const qaEvidence = document(qaEvidencePath);
const manualGuiQa = objectField(field(qaEvidence, "manualGuiQa"));
const smokeSuite = document(smokeSuitePath);
const installerDraft = document(installerDraftPath);
const readiness = document(readinessPath);
const notices = document(noticesPath);
const releasePolicy = document(releasePolicyPath);
const licenseReviewTemplate = document(licenseReviewTemplatePath);
const licenseReviewResult = document(licenseReviewResultPath);
const codeSigningTemplate = document(codeSigningTemplatePath);
const codeSigningResult = document(codeSigningResultPath);
const updaterTemplate = document(updaterTemplatePath);
const updaterResult = document(updaterResultPath);
const releaseApprovalTemplate = document(releaseApprovalTemplatePath);
const releaseApprovalResult = document(releaseApprovalResultPath);
const sidecarReadinessTemplate = document(sidecarReadinessTemplatePath);
const sidecarReadinessResult = document(sidecarReadinessResultPath);
const releasePolicySections = objectField(field(releasePolicy, "policy"));
const codeSigningPolicy = objectField(field(releasePolicySections, "codeSigning"));
const updaterPolicy = objectField(field(releasePolicySections, "updater"));
const licenseReviewPolicy = objectField(field(releasePolicySections, "licenseReview"));
const licenseReviewApproved =
  licenseReviewResult.evidenceKind === "windows-license-review-result" &&
  licenseReviewResult.status === "approved" &&
  licenseReviewResult.approved === true;
const codeSigningConfigured =
  codeSigningResult.evidenceKind === "windows-code-signing-readiness-result" &&
  codeSigningResult.status === "configured_verified" &&
  codeSigningResult.configured === true;
const updaterPolicyConfigured =
  updaterResult.evidenceKind === "windows-updater-policy-readiness-result" &&
  updaterResult.status === "policy_decided" &&
  updaterResult.configured === true;
const sidecarReadinessApproved =
  sidecarReadinessResult.evidenceKind === "windows-sidecar-production-readiness-result" &&
  sidecarReadinessResult.status === "approved" &&
  sidecarReadinessResult.approved === true;
const releaseApprovalGranted =
  releaseApprovalResult.evidenceKind === "windows-release-approval-readiness-result" &&
  releaseApprovalResult.status === "approved" &&
  releaseApprovalResult.approvalGranted === true;

const gates: Gate[] = [
  {
    id: "automated_windows_packaging_smoke",
    label: "Automated Windows packaging smoke suite",
    status:
      smokeSuite.status === "success"
        ? "passed"
        : existsSync(smokeSuitePath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: evidence(smokeSuitePath, "lumatrace-windows-packaging-smoke-suite-manifest.json"),
    reason:
      smokeSuite.status === "success" ? undefined : "Windows packaging smoke suite has not passed."
  },
  {
    id: "packaging_qa_evidence",
    label: "Sanitized Windows packaging QA evidence",
    status:
      qaEvidence.status === "automated_evidence_ready"
        ? "passed"
        : existsSync(qaEvidencePath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: evidence(qaEvidencePath, "lumatrace-windows-packaging-qa-evidence.json"),
    reason:
      qaEvidence.status === "automated_evidence_ready"
        ? undefined
        : "Automated QA evidence is missing or incomplete."
  },
  {
    id: "manual_gui_qa",
    label: "Manual installed-app GUI QA",
    status:
      manualGuiQa.status === "result_passed"
        ? "passed"
        : field(qaEvidence, "manualGuiQa")
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: evidence(qaEvidencePath, "lumatrace-windows-packaging-qa-evidence.json"),
    reason:
      manualGuiQa.status === "result_passed"
        ? undefined
        : "Manual GUI QA has not been represented by a validated passed result."
  },
  {
    id: "installer_draft",
    label: "Unsigned Windows installer draft",
    status:
      installerDraft.status === "success"
        ? "passed"
        : existsSync(installerDraftPath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: evidence(installerDraftPath, "lumatrace-installer-draft-manifest.json"),
    reason:
      installerDraft.status === "success"
        ? undefined
        : "Unsigned installer draft has not been generated successfully."
  },
  {
    id: "self_contained_sidecar",
    label: "Self-contained sidecar draft",
    status:
      sidecar.artifactKind === "self-contained"
        ? "passed"
        : existsSync(sidecarPath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: evidence(sidecarPath, "sidecar-manifest.json"),
    reason:
      sidecar.artifactKind === "self-contained"
        ? undefined
        : "Sidecar is not marked as a self-contained draft."
  },
  {
    id: "sidecar_production_readiness",
    label: "Sidecar production readiness",
    status:
      sidecarReadinessApproved ||
      sidecar.productionReady === true ||
      sidecarReadinessTemplate.approved === true
        ? "passed"
        : existsSync(sidecarReadinessResultPath) ||
            existsSync(sidecarReadinessTemplatePath) ||
            existsSync(sidecarPath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: existsSync(sidecarReadinessResultPath)
      ? evidence(
          sidecarReadinessResultPath,
          "lumatrace-windows-sidecar-production-readiness-result.json"
        )
      : existsSync(sidecarReadinessTemplatePath)
        ? evidence(
            sidecarReadinessTemplatePath,
            "lumatrace-windows-sidecar-production-readiness-template.json"
          )
        : evidence(sidecarPath, "sidecar-manifest.json"),
    reason: sidecarReadinessApproved
      ? undefined
      : existsSync(sidecarReadinessResultPath)
        ? "Sidecar production readiness result is present but has not passed verification."
        : existsSync(sidecarReadinessTemplatePath)
          ? "Sidecar production readiness template is generated but reviewer approval remains pending."
          : "Sidecar manifest still records productionReady=false."
  },
  {
    id: "license_notice_review",
    label: "Bundled runtime and dependency license notice review",
    status:
      licenseReviewApproved ||
      sidecar.licenseReviewStatus === "approved" ||
      licenseReviewPolicy.status === "approved" ||
      licenseReviewTemplate.approved === true
        ? "passed"
        : existsSync(noticesPath) ||
            existsSync(releasePolicyPath) ||
            existsSync(licenseReviewTemplatePath) ||
            existsSync(licenseReviewResultPath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: existsSync(licenseReviewResultPath)
      ? evidence(licenseReviewResultPath, "lumatrace-windows-license-review-result.json")
      : existsSync(licenseReviewTemplatePath)
        ? evidence(licenseReviewTemplatePath, "lumatrace-windows-license-review-template.json")
        : existsSync(releasePolicyPath)
          ? evidence(releasePolicyPath, "lumatrace-windows-release-policy-template.json")
          : evidence(noticesPath, "packaging-notices.json"),
    reason: licenseReviewApproved
      ? undefined
      : existsSync(licenseReviewResultPath)
        ? "License review result is present but not approved by the verifier."
        : existsSync(licenseReviewTemplatePath)
          ? "License review template is generated but the human review decision is still pending."
          : "Packaging notices are generated for draft review but license review is not approved."
  },
  {
    id: "code_signing",
    label: "Windows code signing",
    status:
      codeSigningConfigured ||
      codeSigningPolicy.status === "configured_verified" ||
      codeSigningTemplate.configured === true
        ? "passed"
        : existsSync(codeSigningResultPath) ||
            existsSync(codeSigningTemplatePath) ||
            existsSync(releasePolicyPath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: existsSync(codeSigningResultPath)
      ? evidence(codeSigningResultPath, "lumatrace-windows-code-signing-readiness-result.json")
      : existsSync(codeSigningTemplatePath)
        ? evidence(
            codeSigningTemplatePath,
            "lumatrace-windows-code-signing-readiness-template.json"
          )
        : evidence(releasePolicyPath, "lumatrace-windows-release-policy-template.json"),
    reason: codeSigningConfigured
      ? undefined
      : existsSync(codeSigningResultPath)
        ? "Code signing readiness result is present but not configured and verified."
        : existsSync(codeSigningTemplatePath)
          ? "Code signing readiness template is generated but certificate, timestamping, and verification remain unconfigured."
          : "Code signing certificate, signing command, and verification policy are not configured."
  },
  {
    id: "updater_policy",
    label: "Updater policy",
    status:
      updaterPolicyConfigured ||
      updaterPolicy.status === "policy_decided" ||
      updaterTemplate.configured === true
        ? "passed"
        : existsSync(updaterResultPath) ||
            existsSync(updaterTemplatePath) ||
            existsSync(releasePolicyPath)
          ? "blocked"
          : "missing",
    requiredForRelease: true,
    evidence: existsSync(updaterResultPath)
      ? evidence(updaterResultPath, "lumatrace-windows-updater-policy-readiness-result.json")
      : existsSync(updaterTemplatePath)
        ? evidence(
            updaterTemplatePath,
            "lumatrace-windows-updater-policy-readiness-template.json"
          )
        : evidence(releasePolicyPath, "lumatrace-windows-release-policy-template.json"),
    reason: updaterPolicyConfigured
      ? undefined
      : existsSync(updaterResultPath)
        ? "Updater policy readiness result is present but the policy decision has not passed verification."
        : existsSync(updaterTemplatePath)
          ? "Updater policy readiness template is generated but updater strategy, signing, rollback, and verification remain unconfigured."
          : "Updater strategy and update signing policy are not configured."
  },
  {
    id: "release_approval",
    label: "Production release approval",
    status: releaseApprovalGranted
      ? "passed"
      : existsSync(releaseApprovalResultPath) ||
          existsSync(releaseApprovalTemplatePath) ||
          existsSync(releasePolicyPath)
        ? "blocked"
        : "missing",
    requiredForRelease: true,
    evidence: existsSync(releaseApprovalResultPath)
      ? evidence(
          releaseApprovalResultPath,
          "lumatrace-windows-release-approval-readiness-result.json"
        )
      : existsSync(releaseApprovalTemplatePath)
        ? evidence(
            releaseApprovalTemplatePath,
            "lumatrace-windows-release-approval-readiness-template.json"
          )
        : existsSync(releasePolicyPath)
          ? evidence(releasePolicyPath, "lumatrace-windows-release-policy-template.json")
          : evidence(readinessPath, "lumatrace-windows-packaging-release-readiness.json"),
    reason: releaseApprovalGranted
      ? undefined
      : existsSync(releaseApprovalResultPath)
        ? "Release approval readiness result is present but has not passed verification."
        : existsSync(releaseApprovalTemplatePath)
          ? "Release approval readiness template is generated but production approval remains not granted."
          : readiness.releaseStatus === "blocked"
            ? "Release readiness gate remains blocked."
            : "Release approval is not granted."
  }
];

const blockers: RcBlocker[] = gates
  .filter((gate) => gate.status !== "passed")
  .map((gate) => ({
    code: gate.id.toUpperCase(),
    gateId: gate.id,
    reason: gate.reason ?? `${gate.label} is not complete.`,
    requiredForRelease: true
  }));

const manifest: RcGateManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-packaging-rc-gate",
  status: "blocked",
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  gates,
  blockers,
  policy: {
    codeSigningConfigured,
    updaterConfigured: updaterPolicyConfigured,
    storeDistributionConfigured: false,
    productionApprovalGranted: releaseApprovalGranted
  },
  limitations: [
    "This RC gate summarizes packaging readiness blockers for unsigned Windows QA drafts.",
    "It is not a production release approval and does not configure signing, updater, store distribution, notarization, or iOS.",
    "The manifest includes artifact names, hashes, sizes, statuses, and blocker codes only.",
    "It must not include auth tokens, full local paths, raw logs, command lines, raw CSV, Android serials, or stack traces.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Windows packaging RC gate written to ${outputPath}`);
console.log(`status=${manifest.status}`);
console.log(`blockers=${manifest.blockers.map((blocker) => blocker.code).join(",")}`);
