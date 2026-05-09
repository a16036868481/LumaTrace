import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingReleaseGateResultsImportEntrySummary {
  gate: string;
  blockerCode: string;
  resultFile: string;
  templateFile: string;
  sourceFile: string;
  status: "missing_source" | "valid_imported" | "valid_dry_run" | "invalid_rejected" | "unknown";
  copied: boolean;
  verifierCommand: string;
  rcGateSmokeCommand: string;
  sha256?: string;
  sizeBytes?: number;
  verifierExitCode?: number | null;
  reason: string;
}

export interface PackagingReleaseGateResultsImportSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-release-gate-results-import-manifest.json";
  sizeBytes?: number;
  evidenceKind?: string;
  status?: string;
  sourceDirectoryKind?: string;
  dryRun?: boolean;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  unsignedDraft?: boolean;
  importSummary?: {
    total: number;
    valid: number;
    invalid: number;
    missing: number;
    copied: number;
  };
  results?: PackagingReleaseGateResultsImportEntrySummary[];
  ignoredFiles?: string[];
  refreshedIntake?: {
    fileName: string;
    status: string;
    validResults: number;
    invalidResults: number;
    missingResults: number;
  };
  nextCommands?: string[];
  securityAssertions?: Record<string, JsonValue>;
  limitations?: string[];
  reason?: string;
}

const importManifestFileName = "lumatrace-windows-release-gate-results-import-manifest.json";
const knownStatuses = new Set(["missing_source", "valid_imported", "valid_dry_run", "invalid_rejected"]);
const knownManifestStatuses = new Set([
  "no_results_found",
  "valid_results_imported",
  "invalid_results_rejected",
  "mixed_results",
  "dry_run"
]);

function candidateImportPaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, importManifestFileName));
    candidates.add(resolve(manifestDir, "..", importManifestFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", importManifestFileName));
  return Array.from(candidates);
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function safeFileName(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || /[\\/]/u.test(value)) {
    return undefined;
  }
  return value;
}

function summarizeReason(value: JsonValue | undefined): string {
  if (typeof value !== "string") {
    return "No reason recorded.";
  }
  return value.replace(/\bstd(?:out|err)\b/giu, "verifier output");
}

function summarizeStringArray(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === "string" && !/[\\/]/u.test(entry));
}

function summarizeImportCounts(value: JsonValue | undefined): PackagingReleaseGateResultsImportSummary["importSummary"] {
  const object = asObject(value);
  if (
    object === undefined ||
    typeof object.total !== "number" ||
    typeof object.valid !== "number" ||
    typeof object.invalid !== "number" ||
    typeof object.missing !== "number" ||
    typeof object.copied !== "number"
  ) {
    return undefined;
  }
  return {
    total: object.total,
    valid: object.valid,
    invalid: object.invalid,
    missing: object.missing,
    copied: object.copied
  };
}

function summarizeRefreshedIntake(value: JsonValue | undefined): PackagingReleaseGateResultsImportSummary["refreshedIntake"] {
  const object = asObject(value);
  if (
    object === undefined ||
    typeof object.fileName !== "string" ||
    /[\\/]/u.test(object.fileName) ||
    typeof object.status !== "string" ||
    typeof object.validResults !== "number" ||
    typeof object.invalidResults !== "number" ||
    typeof object.missingResults !== "number"
  ) {
    return undefined;
  }
  return {
    fileName: object.fileName,
    status: object.status,
    validResults: object.validResults,
    invalidResults: object.invalidResults,
    missingResults: object.missingResults
  };
}

function summarizeResults(value: JsonValue | undefined): PackagingReleaseGateResultsImportEntrySummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => {
      const object = asObject(entry);
      const resultFile = safeFileName(object?.resultFile);
      const templateFile = safeFileName(object?.templateFile);
      const sourceFile = safeFileName(object?.sourceFile);
      if (
        object === undefined ||
        typeof object.gate !== "string" ||
        typeof object.blockerCode !== "string" ||
        resultFile === undefined ||
        templateFile === undefined ||
        sourceFile === undefined ||
        typeof object.verifierCommand !== "string" ||
        typeof object.rcGateSmokeCommand !== "string"
      ) {
        return undefined;
      }

      const status: PackagingReleaseGateResultsImportEntrySummary["status"] =
        typeof object.status === "string" && knownStatuses.has(object.status)
          ? (object.status as PackagingReleaseGateResultsImportEntrySummary["status"])
          : "unknown";

      return {
        gate: object.gate,
        blockerCode: object.blockerCode,
        resultFile,
        templateFile,
        sourceFile,
        status,
        copied: object.copied === true,
        verifierCommand: object.verifierCommand,
        rcGateSmokeCommand: object.rcGateSmokeCommand,
        ...(typeof object.sha256 === "string" ? { sha256: object.sha256 } : {}),
        ...(typeof object.sizeBytes === "number" ? { sizeBytes: object.sizeBytes } : {}),
        ...(typeof object.verifierExitCode === "number" || object.verifierExitCode === null
          ? { verifierExitCode: object.verifierExitCode }
          : {}),
        reason: summarizeReason(object.reason)
      };
    })
    .filter((entry): entry is PackagingReleaseGateResultsImportEntrySummary => entry !== undefined);
}

function buildInvalidReason(
  document: Record<string, JsonValue>,
  results: PackagingReleaseGateResultsImportEntrySummary[] | undefined
): string | undefined {
  if (document.evidenceKind !== "windows-release-gate-results-import") {
    return "Windows release gate results import manifest has an unexpected evidence kind";
  }
  if (document.productionReady !== false || document.rcCandidateReady !== false || document.unsignedDraft !== true) {
    return "Windows release gate results import manifest must keep rcCandidateReady=false, productionReady=false, and unsignedDraft=true";
  }
  if (typeof document.status !== "string" || !knownManifestStatuses.has(document.status)) {
    return "Windows release gate results import manifest has an unknown status";
  }
  if (results === undefined || results.length === 0) {
    return "Windows release gate results import manifest has no result entries";
  }
  if (results.some((entry) => entry.status === "unknown")) {
    return "Windows release gate results import manifest contains an unknown result status";
  }
  if (results.some((entry) => entry.copied && entry.status !== "valid_imported")) {
    return "Windows release gate results import manifest has an inconsistent copied flag";
  }
  return undefined;
}

export function readPackagingReleaseGateResultsImport(
  sidecarManifestPath: string | undefined
): PackagingReleaseGateResultsImportSummary {
  const importPath = candidateImportPaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (importPath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: importManifestFileName,
      reason: "Windows release gate results import manifest is missing"
    };
  }

  try {
    const text = readFileSync(importPath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const results = summarizeResults(document.results);
    const importSummary = summarizeImportCounts(document.importSummary);
    const refreshedIntake = summarizeRefreshedIntake(document.refreshedIntake);
    const ignoredFiles = summarizeStringArray(document.ignoredFiles);
    const nextCommands = summarizeStringArray(document.nextCommands);
    const limitations = summarizeStringArray(document.limitations);
    const securityAssertions = asObject(document.securityAssertions);
    const reason = buildInvalidReason(document, results);

    return {
      exists: true,
      valid: reason === undefined,
      fileName: importManifestFileName,
      sizeBytes: statSync(importPath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.sourceDirectoryKind === "string" ? { sourceDirectoryKind: document.sourceDirectoryKind } : {}),
      ...(typeof document.dryRun === "boolean" ? { dryRun: document.dryRun } : {}),
      ...(typeof document.rcCandidateReady === "boolean" ? { rcCandidateReady: document.rcCandidateReady } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.unsignedDraft === "boolean" ? { unsignedDraft: document.unsignedDraft } : {}),
      ...(importSummary !== undefined ? { importSummary } : {}),
      ...(results !== undefined ? { results } : {}),
      ...(ignoredFiles !== undefined ? { ignoredFiles } : {}),
      ...(refreshedIntake !== undefined ? { refreshedIntake } : {}),
      ...(nextCommands !== undefined ? { nextCommands } : {}),
      ...(securityAssertions !== undefined ? { securityAssertions } : {}),
      ...(limitations !== undefined ? { limitations } : {}),
      ...(reason === undefined ? {} : { reason })
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: importManifestFileName,
      sizeBytes: statSync(importPath).size,
      reason: "Windows release gate results import manifest is not valid JSON"
    };
  }
}
