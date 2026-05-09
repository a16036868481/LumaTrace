import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface ManualGuiQaStep {
  id: string;
  section: string;
  text: string;
}

interface ManualGuiQaTemplate {
  sourceChecklist: {
    path: "docs/windows-packaging-manual-gui-checklist.md";
    itemCount: number;
  };
  securityAssertions: Record<string, unknown>;
  steps: ManualGuiQaStep[];
}

interface LicenseReviewItem {
  name: string;
  version?: string;
  license: string;
  needsHumanReview: boolean;
}

interface LicenseReviewTemplate {
  sourceNotices: Record<string, unknown>;
  summary: Record<string, unknown>;
  reviewItems: LicenseReviewItem[];
  securityAssertions: Record<string, unknown>;
}

interface ArtifactEvidence {
  fileName: string;
  exists: boolean;
  sha256?: string;
  sizeBytes?: number;
  requiredForRc?: true;
}

interface ArtifactTemplate {
  artifacts: ArtifactEvidence[];
  securityAssertions: Record<string, unknown>;
}

interface SidecarReadinessTemplate {
  sidecar: Record<string, unknown>;
  checks: Record<string, unknown>;
  evidence: ArtifactEvidence[];
  securityAssertions: Record<string, unknown>;
}

interface ReleaseApprovalTemplate {
  evidence: ArtifactEvidence[];
  securityAssertions: Record<string, unknown>;
}

interface RcGate {
  productionReady?: boolean;
  rcCandidateReady?: boolean;
  gates?: Array<{
    id?: string;
    status?: string;
    evidence?: {
      fileName?: string;
    };
  }>;
  blockers?: Array<{
    code?: string;
  }>;
  policy?: {
    codeSigningConfigured?: boolean;
    updaterConfigured?: boolean;
    productionApprovalGranted?: boolean;
  };
}

interface GateResultEntry {
  blockerCode?: string;
  status?: string;
  canRemoveBlocker?: boolean;
  sha256?: string;
  sizeBytes?: number;
  verifierExitCode?: number | null;
}

interface ReleaseGateResultsIntake {
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  results?: GateResultEntry[];
  securityAssertions?: {
    tokenRedacted?: boolean;
    fullLocalPathsRedacted?: boolean;
    rawVerifierOutputExcluded?: boolean;
    rawLogsExcluded?: boolean;
    reviewerNotesExcluded?: boolean;
    publicSidecarListenersAllowed?: boolean;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");

const paths = {
  manualTemplate: resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json"),
  manualResult: resolve(releaseDir, "lumatrace-windows-manual-gui-qa-result.json"),
  licenseTemplate: resolve(releaseDir, "lumatrace-windows-license-review-template.json"),
  licenseResult: resolve(releaseDir, "lumatrace-windows-license-review-result.json"),
  codeTemplate: resolve(releaseDir, "lumatrace-windows-code-signing-readiness-template.json"),
  codeResult: resolve(releaseDir, "lumatrace-windows-code-signing-readiness-result.json"),
  updaterTemplate: resolve(
    releaseDir,
    "lumatrace-windows-updater-policy-readiness-template.json"
  ),
  updaterResult: resolve(releaseDir, "lumatrace-windows-updater-policy-readiness-result.json"),
  sidecarTemplate: resolve(
    releaseDir,
    "lumatrace-windows-sidecar-production-readiness-template.json"
  ),
  sidecarResult: resolve(
    releaseDir,
    "lumatrace-windows-sidecar-production-readiness-result.json"
  ),
  approvalTemplate: resolve(
    releaseDir,
    "lumatrace-windows-release-approval-readiness-template.json"
  ),
  approvalResult: resolve(releaseDir, "lumatrace-windows-release-approval-readiness-result.json"),
  qaEvidence: resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json"),
  releasePolicy: resolve(releaseDir, "lumatrace-windows-release-policy-template.json"),
  releaseGateResults: resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json"),
  rcGate: resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json")
};

const restorePaths = [
  paths.manualResult,
  paths.licenseResult,
  paths.codeResult,
  paths.updaterResult,
  paths.sidecarResult,
  paths.approvalResult,
  paths.qaEvidence,
  paths.releasePolicy,
  paths.releaseGateResults,
  paths.rcGate
] as const;

const previousFiles = new Map<string, string | undefined>(
  restorePaths.map((path) => [path, existsSync(path) ? readFileSync(path, "utf8") : undefined])
);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runNodeScript(scriptPath: string, args: string[] = []): void {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim().length > 0) {
    console.error(result.stderr.trim());
  }
  if (result.status !== 0) {
    fail(`${scriptPath} failed with exit code ${String(result.status)}`);
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret|password)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureTemplates(): void {
  runNodeScript("scripts/export-windows-manual-gui-qa-template.ts");
  runNodeScript("scripts/export-windows-license-review-template.ts");
  runNodeScript("scripts/export-windows-code-signing-readiness-template.ts");
  runNodeScript("scripts/export-windows-updater-policy-readiness-template.ts");
  runNodeScript("scripts/export-windows-sidecar-production-readiness-template.ts");
  runNodeScript("scripts/export-windows-release-approval-readiness-template.ts");
}

function writeManualGuiQaResult(): void {
  const template = readJson<ManualGuiQaTemplate>(paths.manualTemplate);
  writeJson(paths.manualResult, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-manual-gui-qa-result",
    status: "passed",
    productionReady: false,
    unsignedDraft: true,
    sourceChecklist: template.sourceChecklist,
    reviewer: {
      name: "Full RC Fixture QA Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      environment: "Synthetic full RC gate result smoke environment"
    },
    steps: template.steps.map((step) => ({
      id: step.id,
      section: step.section,
      text: step.text,
      status: "passed",
      evidenceNote: `Synthetic full RC gate fixture evidence for ${step.id}.`,
      reviewerNote: "Verifier smoke fixture; not a real manual GUI QA pass."
    })),
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify full RC gate result progression.",
      "This file is removed after the smoke and is not real manual QA evidence.",
      "productionReady remains false."
    ]
  });
}

function writeLicenseReviewResult(): void {
  const template = readJson<LicenseReviewTemplate>(paths.licenseTemplate);
  writeJson(paths.licenseResult, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-license-review-result",
    status: "approved",
    approved: true,
    productionReady: false,
    unsignedDraft: true,
    sourceNotices: template.sourceNotices,
    reviewer: {
      name: "Full RC Fixture License Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    summary: template.summary,
    reviewItems: template.reviewItems.map((item) => ({
      ...item,
      reviewDecision: "approved",
      resolution:
        item.license === "UNKNOWN"
          ? "Synthetic fixture resolution: private LumaTrace workspace package classified for draft review."
          : "Synthetic fixture resolution: generated notice metadata reviewed for full RC gate smoke.",
      reviewerNote: item.needsHumanReview
        ? "Synthetic fixture reviewer note for full RC gate license review smoke."
        : "Synthetic fixture confirms recorded notice metadata."
    })),
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify full RC gate result progression.",
      "This file is removed after the smoke and is not real license approval.",
      "productionReady remains false."
    ]
  });
}

function writeCodeSigningResult(): void {
  const template = readJson<ArtifactTemplate>(paths.codeTemplate);
  const signedArtifacts = template.artifacts.filter((artifact) => artifact.exists);
  writeJson(paths.codeResult, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-code-signing-readiness-result",
    status: "configured_verified",
    configured: true,
    productionReady: false,
    unsignedDraft: true,
    certificate: {
      configured: true,
      subjectNameRecorded: true,
      thumbprintRecorded: true,
      privateKeyAvailable: false,
      storage: "external-release-signing-store",
      subjectNameSanitized: "LumaTrace release signing certificate summary",
      thumbprintSha256: "0".repeat(64)
    },
    timestamping: {
      configured: true,
      serverUrlRecorded: true,
      digestAlgorithmRecorded: true,
      serverNameSanitized: "trusted timestamp authority summary",
      digestAlgorithm: "sha256"
    },
    verification: {
      configured: true,
      verifyCommandRecorded: false,
      signatureVerified: true,
      signedArtifactCount: signedArtifacts.length
    },
    artifacts: template.artifacts.map((artifact) => ({
      ...artifact,
      signatureVerified: artifact.exists,
      signedSha256: artifact.sha256,
      verificationSummary: artifact.exists
        ? "Synthetic fixture signature verification summary."
        : "Artifact absent in this draft fixture."
    })),
    reviewer: {
      name: "Full RC Fixture Signing Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "configured_verified"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify full RC gate result progression.",
      "This file is removed after the smoke and is not real signing evidence.",
      "productionReady remains false."
    ]
  });
}

function writeUpdaterPolicyResult(): void {
  const template = readJson<ArtifactTemplate>(paths.updaterTemplate);
  writeJson(paths.updaterResult, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-updater-policy-readiness-result",
    status: "policy_decided",
    configured: true,
    productionReady: false,
    unsignedDraft: true,
    updater: {
      configured: true,
      provider: "disabled_for_initial_release",
      endpointRecorded: true,
      endpointSummarySanitized:
        "No update endpoint is enabled for the initial unsigned QA release.",
      channelStrategyConfigured: true,
      channelStrategy: "Manual distribution only until signing and update hosting are approved.",
      autoUpdateEnabled: false
    },
    updateSigning: {
      configured: true,
      publicKeyRecorded: false,
      privateKeyAvailable: false,
      signingCommandRecorded: false,
      signingPolicy:
        "Update signing is deferred because automatic updates are disabled for this release."
    },
    rollback: {
      configured: true,
      rollbackPolicyConfigured: true,
      stagedRolloutConfigured: true,
      rollbackTestRecorded: true,
      rollbackPolicySummary:
        "Rollback is handled by reinstalling the previous manually distributed build."
    },
    verification: {
      configured: true,
      updateManifestVerified: true,
      installerUpdatePathVerified: true,
      signedUpdateVerified: true,
      policyReviewPassed: true
    },
    artifacts: template.artifacts.map((artifact) => ({
      ...artifact,
      policyReviewed: artifact.exists,
      verificationSummary: artifact.exists
        ? "Synthetic fixture policy review summary."
        : "Artifact absent in this draft fixture."
    })),
    reviewer: {
      name: "Full RC Fixture Updater Policy Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "policy_decided"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify full RC gate result progression.",
      "This file is removed after the smoke and is not real updater evidence.",
      "No updater is implemented or enabled by this fixture.",
      "productionReady remains false."
    ]
  });
}

function writeSidecarReadinessResult(): void {
  const template = readJson<SidecarReadinessTemplate>(paths.sidecarTemplate);
  writeJson(paths.sidecarResult, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-sidecar-production-readiness-result",
    status: "approved",
    approved: true,
    productionReady: false,
    unsignedDraft: true,
    sidecar: {
      ...template.sidecar,
      artifactKind: "self-contained",
      nodeRequired: false,
      manifestProductionReady: false
    },
    checks: {
      ...template.checks,
      selfContainedDraftPresent: true,
      bundledRuntimeRecorded: true,
      nodeRequiredFalse: true,
      releaseSidecarSmokePassed: true,
      sidecarAuthTransportSmokePassed: true,
      installedSidecarHealthSmokePassed: true,
      publicSidecarListenersAllowed: false,
      licenseReviewApproved: false
    },
    evidence: template.evidence.map((item) => ({
      ...item,
      reviewed: item.exists,
      reviewSummary: item.exists
        ? "Synthetic fixture sidecar readiness review summary."
        : "Evidence absent in this draft fixture."
    })),
    reviewer: {
      name: "Full RC Fixture Sidecar Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify full RC gate result progression.",
      "This file is removed after the smoke and is not real sidecar production approval.",
      "It does not approve license review, signing, updater policy, release approval, or productionReady=true."
    ]
  });
}

function writeReleaseApprovalResult(): void {
  const template = readJson<ReleaseApprovalTemplate>(paths.approvalTemplate);
  writeJson(paths.approvalResult, {
    schemaVersion: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    evidenceKind: "windows-release-approval-readiness-result",
    status: "approved",
    approvalGranted: true,
    rcCandidateReady: false,
    productionReady: false,
    unsignedDraft: true,
    approval: {
      approverRecorded: true,
      approverRoleRecorded: true,
      approvedAtRecorded: true,
      decision: "approved",
      releaseNotesApproved: true,
      approverNameSanitized: "Release approver summary",
      approverRoleSanitized: "Release owner"
    },
    requiredEvidence: {
      manualGuiQaPassed: true,
      licenseReviewApproved: true,
      codeSigningVerified: true,
      updaterPolicyConfigured: true,
      sidecarProductionReady: true,
      smokeSuitePassed: true
    },
    evidence: template.evidence.map((item) => ({
      ...item,
      reviewed: item.exists,
      reviewSummary: item.exists
        ? "Synthetic fixture release approval evidence review summary."
        : "Evidence absent in this draft fixture."
    })),
    reviewer: {
      name: "Full RC Fixture Release Approval Reviewer",
      completedAt: "2026-04-30T00:00:00.000Z",
      decision: "approved"
    },
    securityAssertions: template.securityAssertions,
    limitations: [
      "Synthetic fixture used only to verify full RC gate result progression.",
      "This file is removed after the smoke and is not real release approval.",
      "productionReady remains false."
    ]
  });
}

function verifyResults(): void {
  runNodeScript("scripts/verify-windows-manual-gui-qa-result.ts", [paths.manualResult]);
  runNodeScript("scripts/verify-windows-license-review-result.ts", [paths.licenseResult]);
  runNodeScript("scripts/verify-windows-code-signing-readiness-result.ts", [paths.codeResult]);
  runNodeScript("scripts/verify-windows-updater-policy-readiness-result.ts", [paths.updaterResult]);
  runNodeScript("scripts/verify-windows-sidecar-production-readiness-result.ts", [
    paths.sidecarResult
  ]);
  runNodeScript("scripts/verify-windows-release-approval-readiness-result.ts", [
    paths.approvalResult
  ]);
}

function assertFullRcGateProgress(): void {
  const text = readFileSync(paths.rcGate, "utf8");
  const rcGate = JSON.parse(text) as RcGate;
  const gates = rcGate.gates ?? [];
  const gateById = new Map(gates.map((gate) => [gate.id, gate]));
  const blockerCodes = new Set((rcGate.blockers ?? []).map((blocker) => blocker.code));
  const expectedPassedGates = [
    "manual_gui_qa",
    "license_notice_review",
    "code_signing",
    "updater_policy",
    "sidecar_production_readiness",
    "release_approval"
  ];

  if (!hasCleanText(text)) {
    fail("RC gate must remain sanitized after full synthetic result set");
  }
  if (rcGate.productionReady !== false || rcGate.rcCandidateReady !== false) {
    fail("Full synthetic result smoke must not mark the RC or production release ready");
  }
  if (rcGate.policy?.codeSigningConfigured !== true) {
    fail(
      "RC gate policy should record codeSigningConfigured=true after a validated signing result"
    );
  }
  if (rcGate.policy?.updaterConfigured !== true) {
    fail(
      "RC gate policy should record updaterConfigured=true after a validated updater policy result"
    );
  }
  if (rcGate.policy?.productionApprovalGranted !== true) {
    fail(
      "RC gate policy should record productionApprovalGranted=true after a validated release approval result"
    );
  }

  for (const gateId of expectedPassedGates) {
    const gate = gateById.get(gateId);
    if (gate?.status !== "passed") {
      fail(`Expected ${gateId} gate to pass, got ${String(gate?.status)}`);
    }
    if (blockerCodes.has(gateId.toUpperCase())) {
      fail(`Expected ${gateId.toUpperCase()} blocker to be absent`);
    }
  }

  if ((rcGate.blockers ?? []).length !== 0) {
    fail(`Expected all RC blockers to be absent, got ${Array.from(blockerCodes).join(",")}`);
  }
}

function assertReleaseGateResultsAllValid(): void {
  const text = readFileSync(paths.releaseGateResults, "utf8");
  const intake = JSON.parse(text) as ReleaseGateResultsIntake;
  const results = intake.results ?? [];
  const valid = results.filter((entry) => entry.status === "valid_result");
  const invalid = results.filter((entry) => entry.status === "invalid_result");
  const missing = results.filter((entry) => entry.status === "missing_result");

  if (!hasCleanText(text)) {
    fail("Release gate results intake must remain sanitized after full synthetic result set");
  }
  if (intake.evidenceKind !== "windows-release-gate-results-intake") {
    fail("Expected release gate results intake evidence kind");
  }
  if (intake.status !== "all_results_valid") {
    fail(`Expected all_results_valid, got ${String(intake.status)}`);
  }
  if (intake.productionReady !== false || intake.rcCandidateReady !== false) {
    fail("Full synthetic result set must not mark the release gate results ready");
  }
  if (results.length !== 6 || valid.length !== 6 || invalid.length !== 0 || missing.length !== 0) {
    fail("Expected all six release gate result entries to be valid");
  }
  for (const entry of valid) {
    if (
      entry.canRemoveBlocker !== true ||
      typeof entry.sha256 !== "string" ||
      typeof entry.sizeBytes !== "number" ||
      entry.verifierExitCode !== 0
    ) {
      fail(`Expected valid entry to include blocker removal, hash, size, and zero verifier exit: ${String(entry.blockerCode)}`);
    }
  }
  if (
    intake.securityAssertions?.tokenRedacted !== true ||
    intake.securityAssertions.fullLocalPathsRedacted !== true ||
    intake.securityAssertions.rawVerifierOutputExcluded !== true ||
    intake.securityAssertions.rawLogsExcluded !== true ||
    intake.securityAssertions.reviewerNotesExcluded !== true ||
    intake.securityAssertions.publicSidecarListenersAllowed !== false
  ) {
    fail("Release gate results intake must preserve security assertions");
  }
}

try {
  ensureTemplates();
  writeManualGuiQaResult();
  writeLicenseReviewResult();
  writeCodeSigningResult();
  writeUpdaterPolicyResult();
  writeSidecarReadinessResult();
  writeReleaseApprovalResult();
  verifyResults();
  runNodeScript("scripts/export-windows-release-gate-results.ts");
  assertReleaseGateResultsAllValid();
  runNodeScript("scripts/verify-windows-release-gate-results.ts");
  runNodeScript("scripts/export-windows-packaging-qa-evidence.ts");
  runNodeScript("scripts/export-windows-release-policy-template.ts");
  runNodeScript("scripts/export-windows-packaging-rc-gate.ts");
  assertFullRcGateProgress();
  runNodeScript("scripts/verify-windows-packaging-rc-gate.ts");
  console.log("Windows packaging RC gate full-results smoke passed");
} finally {
  for (const [path, previous] of previousFiles.entries()) {
    if (previous === undefined) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, previous, "utf8");
    }
  }
}
