import type { SidecarManifest, SidecarManifestValidation } from "./packagedDiagnostics";
import type { PackagingManualGuiQaHandoffSummary } from "./packagingManualGuiQaHandoff";
import type { PackagingManualGuiQaResultSummary } from "./packagingManualGuiQaResult";
import type { PackagingRcGateSummary } from "./packagingRcGate";
import type { PackagingReleasePolicySummary } from "./packagingReleasePolicy";
import type { PackagingReleaseReadinessSummary } from "./packagingReleaseReadiness";

export type WindowsRcStatus = "missing_evidence" | "blocked" | "ready_for_rc_review";

export interface WindowsRcStatusBlocker {
  code: string;
  source: "sidecar" | "release_readiness" | "rc_gate" | "release_policy" | "manual_gui_qa";
  reason: string;
  requiredForRc: boolean;
}

export interface WindowsRcStatusSummary {
  status: WindowsRcStatus;
  rcCandidateReady: boolean;
  productionReady: false;
  evidence: {
    sidecarManifestValid: boolean;
    artifactKind: string;
    selfContainedSidecar: boolean;
    sidecarProductionReady: boolean;
    licenseReviewStatus: string;
    releaseReadinessValid: boolean;
    rcGateValid: boolean;
    releasePolicyValid: boolean;
    manualGuiQaHandoffValid: boolean;
    manualGuiQaResultValid: boolean;
    manualGuiQaResultStatus: string;
  };
  gateCounts: {
    total: number;
    passed: number;
    blocked: number;
    missing: number;
    unknown: number;
  };
  blockers: WindowsRcStatusBlocker[];
  nextActions: string[];
  warnings: string[];
}

export interface BuildWindowsRcStatusInput {
  manifestValidation: SidecarManifestValidation | undefined;
  manifest: SidecarManifest | undefined;
  releaseReadiness: PackagingReleaseReadinessSummary;
  rcGate: PackagingRcGateSummary;
  releasePolicy: PackagingReleasePolicySummary;
  manualGuiQaHandoff: PackagingManualGuiQaHandoffSummary;
  manualGuiQaResult: PackagingManualGuiQaResultSummary;
}

function gateStatusBucket(status: string | undefined): keyof WindowsRcStatusSummary["gateCounts"] {
  if (status === undefined) {
    return "missing";
  }
  if (/^(passed|ready|complete|ok)$/iu.test(status)) {
    return "passed";
  }
  if (/^(blocked|failed|missing|not_ready|draft_blocked)$/iu.test(status)) {
    return "blocked";
  }
  return "unknown";
}

function summarizeGateCounts(rcGate: PackagingRcGateSummary): WindowsRcStatusSummary["gateCounts"] {
  const gates = rcGate.gates ?? [];
  const counts: WindowsRcStatusSummary["gateCounts"] = {
    total: gates.length,
    passed: 0,
    blocked: 0,
    missing: 0,
    unknown: 0
  };
  for (const gate of gates) {
    counts[gateStatusBucket(gate.status)] += 1;
  }
  return counts;
}

function addBlocker(
  blockers: WindowsRcStatusBlocker[],
  blocker: WindowsRcStatusBlocker | undefined
): void {
  if (blocker !== undefined && !blockers.some((existing) => existing.code === blocker.code && existing.source === blocker.source)) {
    blockers.push(blocker);
  }
}

function collectBlockers(input: BuildWindowsRcStatusInput): WindowsRcStatusBlocker[] {
  const blockers: WindowsRcStatusBlocker[] = [];
  addBlocker(
    blockers,
    input.manifestValidation?.valid === true
      ? undefined
      : {
          code: "SIDECAR_MANIFEST_INVALID",
          source: "sidecar",
          reason: input.manifestValidation?.reason ?? "Sidecar manifest is missing or invalid.",
          requiredForRc: true
        }
  );
  addBlocker(
    blockers,
    input.manifest?.artifactKind === "self-contained"
      ? undefined
      : {
          code: "SIDECAR_NOT_SELF_CONTAINED",
          source: "sidecar",
          reason: "Sidecar artifact must be self-contained before RC review.",
          requiredForRc: true
        }
  );
  addBlocker(
    blockers,
    input.manifest?.productionReady === true
      ? undefined
      : {
          code: "SIDECAR_PRODUCTION_READY_FALSE",
          source: "sidecar",
          reason: "Sidecar manifest still records productionReady=false.",
          requiredForRc: true
        }
  );
  addBlocker(
    blockers,
    input.manifest?.licenseReviewStatus === "complete"
      ? undefined
      : {
          code: "LICENSE_NOTICE_REVIEW_NOT_COMPLETE",
          source: "sidecar",
          reason: "Bundled runtime and third-party notices still require release review.",
          requiredForRc: true
        }
  );

  if (!input.releaseReadiness.valid) {
    addBlocker(blockers, {
      code: "RELEASE_READINESS_INVALID",
      source: "release_readiness",
      reason: input.releaseReadiness.reason ?? "Release readiness manifest is missing or invalid.",
      requiredForRc: true
    });
  }
  for (const blocker of input.releaseReadiness.blockers ?? []) {
    if (blocker.requiredForProduction) {
      addBlocker(blockers, {
        code: blocker.code,
        source: "release_readiness",
        reason: blocker.reason,
        requiredForRc: true
      });
    }
  }

  if (!input.rcGate.valid) {
    addBlocker(blockers, {
      code: "RC_GATE_INVALID",
      source: "rc_gate",
      reason: input.rcGate.reason ?? "RC gate manifest is missing or invalid.",
      requiredForRc: true
    });
  }
  for (const blocker of input.rcGate.blockers ?? []) {
    if (blocker.requiredForRelease) {
      addBlocker(blockers, {
        code: blocker.code,
        source: "rc_gate",
        reason: blocker.reason,
        requiredForRc: true
      });
    }
  }

  if (!input.releasePolicy.valid) {
    addBlocker(blockers, {
      code: "RELEASE_POLICY_INVALID",
      source: "release_policy",
      reason: input.releasePolicy.reason ?? "Release policy template is missing or invalid.",
      requiredForRc: true
    });
  }
  for (const blocker of input.releasePolicy.blockers ?? []) {
    if (blocker.requiredForRc) {
      addBlocker(blockers, {
        code: blocker.code,
        source: "release_policy",
        reason: blocker.reason,
        requiredForRc: true
      });
    }
  }

  if (!input.manualGuiQaHandoff.valid) {
    addBlocker(blockers, {
      code: "MANUAL_GUI_QA_HANDOFF_INVALID",
      source: "manual_gui_qa",
      reason: input.manualGuiQaHandoff.reason ?? "Manual GUI QA handoff manifest is missing or invalid.",
      requiredForRc: true
    });
  }
  if (!input.manualGuiQaResult.valid || input.manualGuiQaResult.status !== "passed") {
    addBlocker(blockers, {
      code: "MANUAL_GUI_QA_RESULT_NOT_PASSED",
      source: "manual_gui_qa",
      reason: input.manualGuiQaResult.reason ?? "Manual GUI QA result is missing, invalid, or not passed.",
      requiredForRc: true
    });
  }

  return blockers;
}

function buildNextActions(blockers: WindowsRcStatusBlocker[]): string[] {
  const actions: string[] = [];
  const has = (source: WindowsRcStatusBlocker["source"] | string, codePattern?: RegExp) =>
    blockers.some((blocker) => blocker.source === source && (codePattern === undefined || codePattern.test(blocker.code)));

  if (has("manual_gui_qa")) {
    actions.push("Run the Windows manual GUI QA checklist and validate the filled result with verify:windows-manual-gui-qa-result.");
  }
  if (has("sidecar", /SIDECAR_PRODUCTION_READY|LICENSE_NOTICE_REVIEW/u)) {
    actions.push("Complete sidecar production readiness review, including bundled runtime and third-party notice review.");
  }
  if (has("rc_gate")) {
    actions.push("Regenerate and review the Windows packaging RC gate after blockers are addressed.");
  }
  if (has("release_policy", /CODE_SIGNING/u)) {
    actions.push("Configure and verify Windows code signing before RC approval.");
  }
  if (has("release_policy", /UPDATER/u)) {
    actions.push("Define updater policy or explicitly keep updater out of scope for the release candidate.");
  }
  if (has("release_policy", /RELEASE_APPROVAL/u)) {
    actions.push("Record release approval evidence before marking an RC ready.");
  }
  if (has("release_readiness")) {
    actions.push("Refresh release readiness evidence after automated smoke and manual QA evidence are updated.");
  }

  return actions.length === 0 ? ["Review release evidence and keep productionReady=false until final approval."] : actions;
}

export function buildWindowsRcStatus(input: BuildWindowsRcStatusInput): WindowsRcStatusSummary {
  const blockers = collectBlockers(input);
  const missingEvidence =
    input.manifestValidation?.valid !== true ||
    !input.releaseReadiness.exists ||
    !input.rcGate.exists ||
    !input.releasePolicy.exists ||
    !input.manualGuiQaHandoff.exists;
  const rcCandidateReady =
    blockers.length === 0 &&
    input.rcGate.rcCandidateReady === true &&
    input.releasePolicy.rcCandidateReady === true &&
    input.releaseReadiness.releaseStatus !== "blocked";
  const status: WindowsRcStatus = missingEvidence ? "missing_evidence" : rcCandidateReady ? "ready_for_rc_review" : "blocked";

  return {
    status,
    rcCandidateReady,
    productionReady: false,
    evidence: {
      sidecarManifestValid: input.manifestValidation?.valid === true,
      artifactKind: input.manifest?.artifactKind ?? "unknown",
      selfContainedSidecar: input.manifest?.artifactKind === "self-contained",
      sidecarProductionReady: input.manifest?.productionReady === true,
      licenseReviewStatus: input.manifest?.licenseReviewStatus ?? "unknown",
      releaseReadinessValid: input.releaseReadiness.valid,
      rcGateValid: input.rcGate.valid,
      releasePolicyValid: input.releasePolicy.valid,
      manualGuiQaHandoffValid: input.manualGuiQaHandoff.valid,
      manualGuiQaResultValid: input.manualGuiQaResult.valid,
      manualGuiQaResultStatus: input.manualGuiQaResult.status ?? (input.manualGuiQaResult.exists ? "invalid" : "missing")
    },
    gateCounts: summarizeGateCounts(input.rcGate),
    blockers,
    nextActions: buildNextActions(blockers),
    warnings: [
      "Windows RC status is a sanitized planning summary, not release approval.",
      "productionReady remains false until signing, updater policy, license review, manual QA, and release approval are complete."
    ]
  };
}
