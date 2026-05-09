import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingReleaseReadinessBlocker {
  code: string;
  reason: string;
  requiredForProduction: boolean;
}

export interface PackagingReleaseReadinessSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-packaging-release-readiness.json";
  sizeBytes?: number;
  evidenceKind?: string;
  releaseStatus?: string;
  qaDraftStatus?: string;
  productionReady?: boolean;
  blockers?: PackagingReleaseReadinessBlocker[];
  checks?: Record<string, JsonValue>;
  reason?: string;
}

const readinessFileName = "lumatrace-windows-packaging-release-readiness.json";

function candidateReadinessPaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, readinessFileName));
    candidates.add(resolve(manifestDir, "..", readinessFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", readinessFileName));
  return Array.from(candidates);
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function summarizeBlockers(value: JsonValue | undefined): PackagingReleaseReadinessBlocker[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      if (object === undefined || typeof object.code !== "string") {
        return undefined;
      }
      return {
        code: object.code,
        reason: typeof object.reason === "string" ? object.reason : "No reason recorded.",
        requiredForProduction: object.requiredForProduction === true
      };
    })
    .filter((entry): entry is PackagingReleaseReadinessBlocker => entry !== undefined);
}

export function readPackagingReleaseReadiness(
  sidecarManifestPath: string | undefined
): PackagingReleaseReadinessSummary {
  const readinessPath = candidateReadinessPaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (readinessPath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: readinessFileName,
      reason: "release readiness manifest is missing"
    };
  }

  try {
    const text = readFileSync(readinessPath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const blockers = summarizeBlockers(document.blockers);
    const checks = asObject(document.checks);
    const valid = document.evidenceKind === "windows-packaging-release-readiness" && document.productionReady === false;
    return {
      exists: true,
      valid,
      fileName: readinessFileName,
      sizeBytes: statSync(readinessPath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.releaseStatus === "string" ? { releaseStatus: document.releaseStatus } : {}),
      ...(typeof document.qaDraftStatus === "string" ? { qaDraftStatus: document.qaDraftStatus } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(blockers !== undefined ? { blockers } : {}),
      ...(checks !== undefined ? { checks } : {}),
      ...(!valid ? { reason: "release readiness manifest has an unexpected evidence kind or readiness value" } : {})
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: readinessFileName,
      sizeBytes: statSync(readinessPath).size,
      reason: "release readiness manifest is not valid JSON"
    };
  }
}
