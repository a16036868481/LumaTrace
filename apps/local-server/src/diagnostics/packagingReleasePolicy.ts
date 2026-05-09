import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingReleasePolicySummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-release-policy-template.json";
  sizeBytes?: number;
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  unsignedDraft?: boolean;
  policy?: Record<string, JsonValue>;
  blockers?: Array<{
    code: string;
    reason: string;
    requiredForRc: boolean;
  }>;
  securityBoundaries?: Record<string, JsonValue>;
  reason?: string;
}

const releasePolicyFileName = "lumatrace-windows-release-policy-template.json";

function candidateReleasePolicyPaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, releasePolicyFileName));
    candidates.add(resolve(manifestDir, "..", releasePolicyFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", releasePolicyFileName));
  return Array.from(candidates);
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function summarizeBlockers(value: JsonValue | undefined): PackagingReleasePolicySummary["blockers"] {
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
        requiredForRc: object.requiredForRc === true
      };
    })
    .filter((entry): entry is NonNullable<PackagingReleasePolicySummary["blockers"]>[number] => entry !== undefined);
}

export function readPackagingReleasePolicy(sidecarManifestPath: string | undefined): PackagingReleasePolicySummary {
  const releasePolicyPath = candidateReleasePolicyPaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (releasePolicyPath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: releasePolicyFileName,
      reason: "Windows release policy template is missing"
    };
  }

  try {
    const text = readFileSync(releasePolicyPath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const policy = asObject(document.policy);
    const securityBoundaries = asObject(document.securityBoundaries);
    const blockers = summarizeBlockers(document.blockers);
    const valid = document.evidenceKind === "windows-release-policy-template" && document.productionReady === false;
    return {
      exists: true,
      valid,
      fileName: releasePolicyFileName,
      sizeBytes: statSync(releasePolicyPath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.rcCandidateReady === "boolean" ? { rcCandidateReady: document.rcCandidateReady } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.unsignedDraft === "boolean" ? { unsignedDraft: document.unsignedDraft } : {}),
      ...(policy !== undefined ? { policy } : {}),
      ...(blockers !== undefined ? { blockers } : {}),
      ...(securityBoundaries !== undefined ? { securityBoundaries } : {}),
      ...(!valid ? { reason: "Windows release policy template has an unexpected evidence kind or readiness value" } : {})
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: releasePolicyFileName,
      sizeBytes: statSync(releasePolicyPath).size,
      reason: "Windows release policy template is not valid JSON"
    };
  }
}
