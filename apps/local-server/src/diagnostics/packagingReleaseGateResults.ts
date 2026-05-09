import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingReleaseGateResultEntrySummary {
  gate: string;
  blockerCode: string;
  resultFile: string;
  templateFile: string;
  status: "missing_result" | "valid_result" | "invalid_result" | "unknown";
  canRemoveBlocker: boolean;
  verifierCommand: string;
  rcGateSmokeCommand: string;
  sha256?: string;
  sizeBytes?: number;
  verifierExitCode?: number | null;
  reason: string;
}

export interface PackagingReleaseGateResultsSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-release-gate-results-intake.json";
  sizeBytes?: number;
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  unsignedDraft?: boolean;
  currentRcBlockers?: string[];
  resultSummary?: {
    total: number;
    valid: number;
    invalid: number;
    missing: number;
  };
  results?: PackagingReleaseGateResultEntrySummary[];
  nextCommands?: string[];
  securityAssertions?: Record<string, JsonValue>;
  limitations?: string[];
  reason?: string;
}

const releaseGateResultsFileName = "lumatrace-windows-release-gate-results-intake.json";
const knownIntakeStatuses = new Set(["no_results", "partial_results", "all_results_valid", "invalid_results"]);
const knownResultStatuses = new Set(["missing_result", "valid_result", "invalid_result"]);

function candidateReleaseGateResultsPaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, releaseGateResultsFileName));
    candidates.add(resolve(manifestDir, "..", releaseGateResultsFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", releaseGateResultsFileName));
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

function safeFileName(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || /[\\/]/u.test(value)) {
    return undefined;
  }
  return value;
}

function summarizeResults(value: JsonValue | undefined): PackagingReleaseGateResultEntrySummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => {
      const object = asObject(entry);
      const resultFile = safeFileName(object?.resultFile);
      const templateFile = safeFileName(object?.templateFile);
      if (
        object === undefined ||
        typeof object.gate !== "string" ||
        typeof object.blockerCode !== "string" ||
        resultFile === undefined ||
        templateFile === undefined ||
        typeof object.verifierCommand !== "string" ||
        typeof object.rcGateSmokeCommand !== "string"
      ) {
        return undefined;
      }

      const status: PackagingReleaseGateResultEntrySummary["status"] =
        typeof object.status === "string" && knownResultStatuses.has(object.status)
          ? (object.status as PackagingReleaseGateResultEntrySummary["status"])
          : "unknown";
      return {
        gate: object.gate,
        blockerCode: object.blockerCode,
        resultFile,
        templateFile,
        status,
        canRemoveBlocker: object.canRemoveBlocker === true,
        verifierCommand: object.verifierCommand,
        rcGateSmokeCommand: object.rcGateSmokeCommand,
        ...(typeof object.sha256 === "string" ? { sha256: object.sha256 } : {}),
        ...(typeof object.sizeBytes === "number" ? { sizeBytes: object.sizeBytes } : {}),
        ...(typeof object.verifierExitCode === "number" || object.verifierExitCode === null
          ? { verifierExitCode: object.verifierExitCode }
          : {}),
        reason: typeof object.reason === "string" ? object.reason : "No reason recorded."
      };
    })
    .filter((entry): entry is PackagingReleaseGateResultEntrySummary => entry !== undefined);
}

function summarizeCounts(results: PackagingReleaseGateResultEntrySummary[] | undefined): PackagingReleaseGateResultsSummary["resultSummary"] {
  if (results === undefined) {
    return undefined;
  }
  return results.reduce<NonNullable<PackagingReleaseGateResultsSummary["resultSummary"]>>(
    (summary, entry) => {
      summary.total += 1;
      if (entry.status === "valid_result") {
        summary.valid += 1;
      } else if (entry.status === "invalid_result") {
        summary.invalid += 1;
      } else if (entry.status === "missing_result") {
        summary.missing += 1;
      }
      return summary;
    },
    {
      total: 0,
      valid: 0,
      invalid: 0,
      missing: 0
    }
  );
}

function buildInvalidReason(
  document: Record<string, JsonValue>,
  results: PackagingReleaseGateResultEntrySummary[] | undefined
): string | undefined {
  if (document.evidenceKind !== "windows-release-gate-results-intake") {
    return "Windows release gate results intake has an unexpected evidence kind";
  }
  if (document.productionReady !== false || document.rcCandidateReady !== false || document.unsignedDraft !== true) {
    return "Windows release gate results intake must keep rcCandidateReady=false, productionReady=false, and unsignedDraft=true";
  }
  if (typeof document.status !== "string" || !knownIntakeStatuses.has(document.status)) {
    return "Windows release gate results intake has an unknown status";
  }
  if (results === undefined || results.length === 0) {
    return "Windows release gate results intake has no gate result entries";
  }
  if (results.some((entry) => entry.status === "unknown")) {
    return "Windows release gate results intake contains an unknown gate result status";
  }
  const inconsistent = results.some((entry) => (entry.status === "valid_result") !== entry.canRemoveBlocker);
  if (inconsistent) {
    return "Windows release gate results intake has inconsistent blocker removal flags";
  }
  return undefined;
}

export function readPackagingReleaseGateResults(
  sidecarManifestPath: string | undefined
): PackagingReleaseGateResultsSummary {
  const resultsPath = candidateReleaseGateResultsPaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (resultsPath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: releaseGateResultsFileName,
      reason: "Windows release gate results intake is missing"
    };
  }

  try {
    const text = readFileSync(resultsPath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const results = summarizeResults(document.results);
    const resultSummary = summarizeCounts(results);
    const currentRcBlockers = summarizeStringArray(document.currentRcBlockers);
    const nextCommands = summarizeStringArray(document.nextCommands);
    const limitations = summarizeStringArray(document.limitations);
    const securityAssertions = asObject(document.securityAssertions);
    const reason = buildInvalidReason(document, results);

    return {
      exists: true,
      valid: reason === undefined,
      fileName: releaseGateResultsFileName,
      sizeBytes: statSync(resultsPath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.rcCandidateReady === "boolean" ? { rcCandidateReady: document.rcCandidateReady } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.unsignedDraft === "boolean" ? { unsignedDraft: document.unsignedDraft } : {}),
      ...(currentRcBlockers !== undefined ? { currentRcBlockers } : {}),
      ...(resultSummary !== undefined ? { resultSummary } : {}),
      ...(results !== undefined ? { results } : {}),
      ...(nextCommands !== undefined ? { nextCommands } : {}),
      ...(securityAssertions !== undefined ? { securityAssertions } : {}),
      ...(limitations !== undefined ? { limitations } : {}),
      ...(reason === undefined ? {} : { reason })
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: releaseGateResultsFileName,
      sizeBytes: statSync(resultsPath).size,
      reason: "Windows release gate results intake is not valid JSON"
    };
  }
}
