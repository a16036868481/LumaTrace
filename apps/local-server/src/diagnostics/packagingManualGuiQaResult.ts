import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ManualGuiQaResultReviewerSummary {
  namePresent: boolean;
  completedAtPresent: boolean;
  environmentPresent: boolean;
}

export interface PackagingManualGuiQaResultSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-manual-gui-qa-result.json";
  sizeBytes?: number;
  evidenceKind?: string;
  status?: string;
  productionReady?: boolean;
  unsignedDraft?: boolean;
  sourceChecklist?: {
    path?: string;
    itemCount?: number;
  };
  reviewer?: ManualGuiQaResultReviewerSummary;
  stepSummary?: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    pending: number;
    unknown: number;
  };
  securityAssertions?: Record<string, JsonValue>;
  limitations?: string[];
  reason?: string;
}

const resultFileName = "lumatrace-windows-manual-gui-qa-result.json";
const finalStepStatuses = new Set(["passed", "failed", "blocked"]);

function candidateResultPaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, resultFileName));
    candidates.add(resolve(manifestDir, "..", resultFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", resultFileName));
  return Array.from(candidates);
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function summarizeStringArray(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function hasText(value: JsonValue | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function summarizeReviewer(value: JsonValue | undefined): ManualGuiQaResultReviewerSummary {
  const reviewer = asObject(value);
  if (reviewer === undefined) {
    return {
      namePresent: false,
      completedAtPresent: false,
      environmentPresent: false
    };
  }
  return {
    namePresent: hasText(reviewer.name),
    completedAtPresent: hasText(reviewer.completedAt),
    environmentPresent: hasText(reviewer.environment)
  };
}

function summarizeSourceChecklist(value: JsonValue | undefined): PackagingManualGuiQaResultSummary["sourceChecklist"] {
  const sourceChecklist = asObject(value);
  if (sourceChecklist === undefined) {
    return undefined;
  }
  return {
    ...(typeof sourceChecklist.path === "string" ? { path: sourceChecklist.path } : {}),
    ...(typeof sourceChecklist.itemCount === "number" ? { itemCount: sourceChecklist.itemCount } : {})
  };
}

function summarizeSteps(value: JsonValue | undefined): PackagingManualGuiQaResultSummary["stepSummary"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.reduce<NonNullable<PackagingManualGuiQaResultSummary["stepSummary"]>>(
    (summary, entry) => {
      const step = asObject(entry);
      const status = typeof step?.status === "string" ? step.status : "unknown";
      summary.total += 1;
      if (status === "passed") {
        summary.passed += 1;
      } else if (status === "failed") {
        summary.failed += 1;
      } else if (status === "blocked") {
        summary.blocked += 1;
      } else if (status === "pending") {
        summary.pending += 1;
      } else {
        summary.unknown += 1;
      }
      return summary;
    },
    {
      total: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      pending: 0,
      unknown: 0
    }
  );
}

function expectedStatus(summary: NonNullable<PackagingManualGuiQaResultSummary["stepSummary"]>): string | undefined {
  if (summary.pending > 0 || summary.unknown > 0 || summary.total === 0) {
    return undefined;
  }
  if (summary.failed > 0) {
    return "failed";
  }
  if (summary.blocked > 0) {
    return "blocked";
  }
  return "passed";
}

function buildInvalidReason(
  document: Record<string, JsonValue>,
  reviewer: ManualGuiQaResultReviewerSummary,
  stepSummary: PackagingManualGuiQaResultSummary["stepSummary"],
  sourceChecklist: PackagingManualGuiQaResultSummary["sourceChecklist"]
): string | undefined {
  if (document.evidenceKind !== "windows-manual-gui-qa-result") {
    return "Windows manual GUI QA result has an unexpected evidence kind";
  }
  if (document.productionReady !== false || document.unsignedDraft !== true) {
    return "Windows manual GUI QA result must keep productionReady=false and unsignedDraft=true";
  }
  if (!reviewer.namePresent || !reviewer.completedAtPresent || !reviewer.environmentPresent) {
    return "Windows manual GUI QA result reviewer fields are incomplete";
  }
  if (stepSummary === undefined || stepSummary.total === 0) {
    return "Windows manual GUI QA result has no step results";
  }
  if (stepSummary.pending > 0 || stepSummary.unknown > 0) {
    return "Windows manual GUI QA result contains pending or unknown step statuses";
  }
  const expected = expectedStatus(stepSummary);
  if (document.status !== expected || typeof expected !== "string" || !finalStepStatuses.has(expected)) {
    return "Windows manual GUI QA result status does not match step outcomes";
  }
  if (sourceChecklist?.itemCount !== undefined && sourceChecklist.itemCount !== stepSummary.total) {
    return "Windows manual GUI QA result source checklist item count does not match step count";
  }
  return undefined;
}

export function readPackagingManualGuiQaResult(
  sidecarManifestPath: string | undefined
): PackagingManualGuiQaResultSummary {
  const resultPath = candidateResultPaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (resultPath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: resultFileName,
      reason: "Windows manual GUI QA result is missing"
    };
  }

  try {
    const text = readFileSync(resultPath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const reviewer = summarizeReviewer(document.reviewer);
    const sourceChecklist = summarizeSourceChecklist(document.sourceChecklist);
    const stepSummary = summarizeSteps(document.steps);
    const securityAssertions = asObject(document.securityAssertions);
    const limitations = summarizeStringArray(document.limitations);
    const reason = buildInvalidReason(document, reviewer, stepSummary, sourceChecklist);

    return {
      exists: true,
      valid: reason === undefined,
      fileName: resultFileName,
      sizeBytes: statSync(resultPath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.unsignedDraft === "boolean" ? { unsignedDraft: document.unsignedDraft } : {}),
      ...(sourceChecklist !== undefined ? { sourceChecklist } : {}),
      reviewer,
      ...(stepSummary !== undefined ? { stepSummary } : {}),
      ...(securityAssertions !== undefined ? { securityAssertions } : {}),
      ...(limitations !== undefined ? { limitations } : {}),
      ...(reason === undefined ? {} : { reason })
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: resultFileName,
      sizeBytes: statSync(resultPath).size,
      reason: "Windows manual GUI QA result is not valid JSON"
    };
  }
}
