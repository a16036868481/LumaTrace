import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingManualGuiQaHandoffSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-manual-gui-qa-handoff-manifest.json";
  sizeBytes?: number;
  evidenceKind?: string;
  status?: string;
  manualGuiQaStatus?: string;
  productionReady?: boolean;
  unsignedDraft?: boolean;
  handoffDirectory?: string;
  fileCount?: number;
  files?: Array<{
    role: string;
    fileName: string;
    sizeBytes?: number;
    sha256?: string;
  }>;
  excludedFiles?: string[];
  securityAssertions?: Record<string, JsonValue>;
  limitations?: string[];
  reason?: string;
}

const handoffFileName = "lumatrace-windows-manual-gui-qa-handoff-manifest.json";

function candidateHandoffPaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, handoffFileName));
    candidates.add(resolve(manifestDir, "..", handoffFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", handoffFileName));
  return Array.from(candidates);
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function summarizeFiles(value: JsonValue | undefined): PackagingManualGuiQaHandoffSummary["files"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      if (object === undefined || typeof object.fileName !== "string") {
        return undefined;
      }
      return {
        role: typeof object.role === "string" ? object.role : "unknown",
        fileName: object.fileName,
        ...(typeof object.sizeBytes === "number" ? { sizeBytes: object.sizeBytes } : {}),
        ...(typeof object.sha256 === "string" ? { sha256: object.sha256 } : {})
      };
    })
    .filter((entry): entry is NonNullable<PackagingManualGuiQaHandoffSummary["files"]>[number] => entry !== undefined);
}

function summarizeStringArray(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function readPackagingManualGuiQaHandoff(
  sidecarManifestPath: string | undefined
): PackagingManualGuiQaHandoffSummary {
  const handoffPath = candidateHandoffPaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (handoffPath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: handoffFileName,
      reason: "Windows manual GUI QA handoff manifest is missing"
    };
  }

  try {
    const text = readFileSync(handoffPath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const files = summarizeFiles(document.files);
    const excludedFiles = summarizeStringArray(document.excludedFiles);
    const limitations = summarizeStringArray(document.limitations);
    const securityAssertions = asObject(document.securityAssertions);
    const valid =
      document.evidenceKind === "windows-manual-gui-qa-handoff" &&
      document.productionReady === false &&
      document.manualGuiQaStatus === "not_run";

    return {
      exists: true,
      valid,
      fileName: handoffFileName,
      sizeBytes: statSync(handoffPath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.manualGuiQaStatus === "string" ? { manualGuiQaStatus: document.manualGuiQaStatus } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.unsignedDraft === "boolean" ? { unsignedDraft: document.unsignedDraft } : {}),
      ...(typeof document.handoffDirectory === "string" ? { handoffDirectory: document.handoffDirectory } : {}),
      ...(files !== undefined ? { fileCount: files.length, files } : {}),
      ...(excludedFiles !== undefined ? { excludedFiles } : {}),
      ...(securityAssertions !== undefined ? { securityAssertions } : {}),
      ...(limitations !== undefined ? { limitations } : {}),
      ...(!valid
        ? { reason: "Windows manual GUI QA handoff has an unexpected evidence kind, QA status, or readiness value" }
        : {})
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: handoffFileName,
      sizeBytes: statSync(handoffPath).size,
      reason: "Windows manual GUI QA handoff manifest is not valid JSON"
    };
  }
}
