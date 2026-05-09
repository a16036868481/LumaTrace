import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingRcGateItem {
  id: string;
  label: string;
  status: string;
  requiredForRelease: boolean;
  reason?: string;
}

export interface PackagingRcGateBlocker {
  code: string;
  gateId: string;
  reason: string;
  requiredForRelease: boolean;
}

export interface PackagingRcGateSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-packaging-rc-gate.json";
  sizeBytes?: number;
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  unsignedDraft?: boolean;
  gates?: PackagingRcGateItem[];
  blockers?: PackagingRcGateBlocker[];
  policy?: Record<string, JsonValue>;
  reason?: string;
}

const rcGateFileName = "lumatrace-windows-packaging-rc-gate.json";

function candidateRcGatePaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, rcGateFileName));
    candidates.add(resolve(manifestDir, "..", rcGateFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", rcGateFileName));
  return Array.from(candidates);
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function summarizeGates(value: JsonValue | undefined): PackagingRcGateItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      if (object === undefined || typeof object.id !== "string" || typeof object.label !== "string") {
        return undefined;
      }
      return {
        id: object.id,
        label: object.label,
        status: typeof object.status === "string" ? object.status : "unknown",
        requiredForRelease: object.requiredForRelease === true,
        ...(typeof object.reason === "string" ? { reason: object.reason } : {})
      };
    })
    .filter((entry): entry is PackagingRcGateItem => entry !== undefined);
}

function summarizeBlockers(value: JsonValue | undefined): PackagingRcGateBlocker[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      if (object === undefined || typeof object.code !== "string" || typeof object.gateId !== "string") {
        return undefined;
      }
      return {
        code: object.code,
        gateId: object.gateId,
        reason: typeof object.reason === "string" ? object.reason : "No reason recorded.",
        requiredForRelease: object.requiredForRelease === true
      };
    })
    .filter((entry): entry is PackagingRcGateBlocker => entry !== undefined);
}

export function readPackagingRcGate(sidecarManifestPath: string | undefined): PackagingRcGateSummary {
  const rcGatePath = candidateRcGatePaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (rcGatePath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: rcGateFileName,
      reason: "RC gate manifest is missing"
    };
  }

  try {
    const text = readFileSync(rcGatePath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const gates = summarizeGates(document.gates);
    const blockers = summarizeBlockers(document.blockers);
    const policy = asObject(document.policy);
    const valid = document.evidenceKind === "windows-packaging-rc-gate" && document.productionReady === false;
    return {
      exists: true,
      valid,
      fileName: rcGateFileName,
      sizeBytes: statSync(rcGatePath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.rcCandidateReady === "boolean" ? { rcCandidateReady: document.rcCandidateReady } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.unsignedDraft === "boolean" ? { unsignedDraft: document.unsignedDraft } : {}),
      ...(gates !== undefined ? { gates } : {}),
      ...(blockers !== undefined ? { blockers } : {}),
      ...(policy !== undefined ? { policy } : {}),
      ...(!valid ? { reason: "RC gate manifest has an unexpected evidence kind or readiness value" } : {})
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: rcGateFileName,
      sizeBytes: statSync(rcGatePath).size,
      reason: "RC gate manifest is not valid JSON"
    };
  }
}
