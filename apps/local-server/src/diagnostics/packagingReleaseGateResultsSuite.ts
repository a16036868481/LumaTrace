import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingReleaseGateResultsSuiteCaseSummary {
  name: "no_results" | "partial_results" | "invalid_results" | "all_results_valid" | "unknown";
  status: "passed" | "failed" | "unknown";
  expectedIntakeStatus?: string;
}

export interface PackagingReleaseGateResultsSuiteSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-release-gate-results-suite-smoke-manifest.json";
  sizeBytes?: number;
  suiteKind?: string;
  status?: string;
  productionReady?: boolean;
  rcCandidateReady?: boolean;
  unsigned?: boolean;
  restoredPreviousFiles?: boolean;
  caseSummary?: {
    total: number;
    passed: number;
    failed: number;
    unknown: number;
  };
  cases?: PackagingReleaseGateResultsSuiteCaseSummary[];
  securityAssertions?: Record<string, JsonValue>;
  limitations?: string[];
  reason?: string;
}

const releaseGateResultsSuiteFileName = "lumatrace-windows-release-gate-results-suite-smoke-manifest.json";
const expectedCaseNames = new Set(["no_results", "partial_results", "invalid_results", "all_results_valid"]);

function candidateSuitePaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, releaseGateResultsSuiteFileName));
    candidates.add(resolve(manifestDir, "..", releaseGateResultsSuiteFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", releaseGateResultsSuiteFileName));
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

function summarizeCases(value: JsonValue | undefined): PackagingReleaseGateResultsSuiteCaseSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => {
      const object = asObject(entry);
      if (object === undefined) {
        return undefined;
      }
      const rawName = typeof object.name === "string" && expectedCaseNames.has(object.name) ? object.name : "unknown";
      const rawStatus = object.status === "passed" || object.status === "failed" ? object.status : "unknown";
      return {
        name: rawName as PackagingReleaseGateResultsSuiteCaseSummary["name"],
        status: rawStatus,
        ...(typeof object.expectedIntakeStatus === "string"
          ? { expectedIntakeStatus: object.expectedIntakeStatus }
          : {})
      };
    })
    .filter((entry): entry is PackagingReleaseGateResultsSuiteCaseSummary => entry !== undefined);
}

function summarizeCaseCounts(
  cases: PackagingReleaseGateResultsSuiteCaseSummary[] | undefined
): PackagingReleaseGateResultsSuiteSummary["caseSummary"] {
  if (cases === undefined) {
    return undefined;
  }
  return cases.reduce<NonNullable<PackagingReleaseGateResultsSuiteSummary["caseSummary"]>>(
    (summary, entry) => {
      summary.total += 1;
      if (entry.status === "passed") {
        summary.passed += 1;
      } else if (entry.status === "failed") {
        summary.failed += 1;
      } else {
        summary.unknown += 1;
      }
      return summary;
    },
    { total: 0, passed: 0, failed: 0, unknown: 0 }
  );
}

function buildInvalidReason(
  document: Record<string, JsonValue>,
  cases: PackagingReleaseGateResultsSuiteCaseSummary[] | undefined
): string | undefined {
  if (document.suiteKind !== "windows-release-gate-results-suite") {
    return "Windows release gate results suite manifest has an unexpected suite kind";
  }
  if (document.status !== "success") {
    return "Windows release gate results suite did not finish successfully";
  }
  if (document.productionReady !== false || document.rcCandidateReady !== false || document.unsigned !== true) {
    return "Windows release gate results suite must keep rcCandidateReady=false, productionReady=false, and unsigned=true";
  }
  if (document.restoredPreviousFiles !== true) {
    return "Windows release gate results suite did not confirm previous files were restored";
  }
  if (cases === undefined || cases.length !== expectedCaseNames.size) {
    return "Windows release gate results suite must contain every expected intake case";
  }
  if (cases.some((entry) => entry.name === "unknown" || entry.status !== "passed")) {
    return "Windows release gate results suite contains an unknown or failed intake case";
  }
  const seen = new Set(cases.map((entry) => entry.name));
  if (Array.from(expectedCaseNames).some((name) => !seen.has(name as PackagingReleaseGateResultsSuiteCaseSummary["name"]))) {
    return "Windows release gate results suite is missing an expected intake case";
  }
  return undefined;
}

export function readPackagingReleaseGateResultsSuite(
  sidecarManifestPath: string | undefined
): PackagingReleaseGateResultsSuiteSummary {
  const suitePath = candidateSuitePaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (suitePath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: releaseGateResultsSuiteFileName,
      reason: "Windows release gate results suite smoke manifest is missing"
    };
  }

  try {
    const text = readFileSync(suitePath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const cases = summarizeCases(document.cases);
    const caseSummary = summarizeCaseCounts(cases);
    const securityAssertions = asObject(document.securityAssertions);
    const limitations = summarizeStringArray(document.limitations);
    const reason = buildInvalidReason(document, cases);

    return {
      exists: true,
      valid: reason === undefined,
      fileName: releaseGateResultsSuiteFileName,
      sizeBytes: statSync(suitePath).size,
      ...(typeof document.suiteKind === "string" ? { suiteKind: document.suiteKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.rcCandidateReady === "boolean" ? { rcCandidateReady: document.rcCandidateReady } : {}),
      ...(typeof document.unsigned === "boolean" ? { unsigned: document.unsigned } : {}),
      ...(typeof document.restoredPreviousFiles === "boolean"
        ? { restoredPreviousFiles: document.restoredPreviousFiles }
        : {}),
      ...(caseSummary !== undefined ? { caseSummary } : {}),
      ...(cases !== undefined ? { cases } : {}),
      ...(securityAssertions !== undefined ? { securityAssertions } : {}),
      ...(limitations !== undefined ? { limitations } : {}),
      ...(reason === undefined ? {} : { reason })
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: releaseGateResultsSuiteFileName,
      sizeBytes: statSync(suitePath).size,
      reason: "Windows release gate results suite smoke manifest is not valid JSON"
    };
  }
}
