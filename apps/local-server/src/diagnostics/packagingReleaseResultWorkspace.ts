import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PackagingReleaseResultWorkspaceSummary {
  exists: boolean;
  valid: boolean;
  fileName: "lumatrace-windows-release-result-workspace-manifest.json";
  sizeBytes?: number;
  evidenceKind?: string;
  status?: string;
  rcCandidateReady?: boolean;
  productionReady?: boolean;
  unsignedDraft?: boolean;
  workspaceDirectory?: string;
  currentIntake?: {
    exists: boolean;
    status: string;
    validResults: number;
    invalidResults: number;
    missingResults: number;
  };
  gateSummary?: {
    total: number;
    requiresHumanReview: number;
  };
  draftSummary?: {
    total: number;
    cannotRemoveBlockers: number;
  };
  fileSummary?: {
    total: number;
    templates: number;
    drafts: number;
  };
  gateActions?: Array<{
    gate: string;
    blockerCode: string;
    templateFile: string;
    resultFile: string;
    verifierCommand: string;
    rcGateSmokeCommand: string;
    requiresHumanReview: boolean;
  }>;
  drafts?: Array<{
    gate: string;
    blockerCode: string;
    draftFile: string;
    expectedResultFile: string;
    sourceTemplateFile: string;
    verifierCommand: string;
    rcGateSmokeCommand: string;
    canRemoveBlocker: boolean;
  }>;
  files?: Array<{
    role: string;
    relativePath: string;
    fileName: string;
    sha256?: string;
    sizeBytes?: number;
  }>;
  instructions?: string[];
  excludedFiles?: string[];
  securityAssertions?: Record<string, JsonValue>;
  limitations?: string[];
  reason?: string;
}

const workspaceManifestFileName = "lumatrace-windows-release-result-workspace-manifest.json";
const knownStatus = new Set(["workspace_ready"]);

function candidateWorkspaceManifestPaths(sidecarManifestPath: string | undefined): string[] {
  const candidates = new Set<string>();
  if (sidecarManifestPath !== undefined) {
    const manifestDir = dirname(sidecarManifestPath);
    candidates.add(resolve(manifestDir, workspaceManifestFileName));
    candidates.add(resolve(manifestDir, "..", workspaceManifestFileName));
  }
  candidates.add(resolve(process.cwd(), "apps/desktop/src-tauri/target/release", workspaceManifestFileName));
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

function safeRelativePath(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || value.includes("..") || /^[A-Z]:/iu.test(value) || value.startsWith("/")) {
    return undefined;
  }
  return value;
}

function summarizeCurrentIntake(
  value: JsonValue | undefined
): PackagingReleaseResultWorkspaceSummary["currentIntake"] {
  const object = asObject(value);
  if (
    object === undefined ||
    typeof object.exists !== "boolean" ||
    typeof object.status !== "string" ||
    typeof object.validResults !== "number" ||
    typeof object.invalidResults !== "number" ||
    typeof object.missingResults !== "number"
  ) {
    return undefined;
  }
  return {
    exists: object.exists,
    status: object.status,
    validResults: object.validResults,
    invalidResults: object.invalidResults,
    missingResults: object.missingResults
  };
}

function summarizeGateActions(
  value: JsonValue | undefined
): PackagingReleaseResultWorkspaceSummary["gateActions"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      const templateFile = safeFileName(object?.templateFile);
      const resultFile = safeFileName(object?.resultFile);
      if (
        object === undefined ||
        typeof object.gate !== "string" ||
        typeof object.blockerCode !== "string" ||
        templateFile === undefined ||
        resultFile === undefined ||
        typeof object.verifierCommand !== "string" ||
        typeof object.rcGateSmokeCommand !== "string" ||
        typeof object.requiresHumanReview !== "boolean"
      ) {
        return undefined;
      }
      return {
        gate: object.gate,
        blockerCode: object.blockerCode,
        templateFile,
        resultFile,
        verifierCommand: object.verifierCommand,
        rcGateSmokeCommand: object.rcGateSmokeCommand,
        requiresHumanReview: object.requiresHumanReview
      };
    })
    .filter((entry): entry is NonNullable<PackagingReleaseResultWorkspaceSummary["gateActions"]>[number] => entry !== undefined);
}

function summarizeDrafts(value: JsonValue | undefined): PackagingReleaseResultWorkspaceSummary["drafts"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      const draftFile = safeFileName(object?.draftFile);
      const expectedResultFile = safeFileName(object?.expectedResultFile);
      const sourceTemplateFile = safeFileName(object?.sourceTemplateFile);
      if (
        object === undefined ||
        typeof object.gate !== "string" ||
        typeof object.blockerCode !== "string" ||
        draftFile === undefined ||
        expectedResultFile === undefined ||
        sourceTemplateFile === undefined ||
        typeof object.verifierCommand !== "string" ||
        typeof object.rcGateSmokeCommand !== "string" ||
        typeof object.canRemoveBlocker !== "boolean"
      ) {
        return undefined;
      }
      return {
        gate: object.gate,
        blockerCode: object.blockerCode,
        draftFile,
        expectedResultFile,
        sourceTemplateFile,
        verifierCommand: object.verifierCommand,
        rcGateSmokeCommand: object.rcGateSmokeCommand,
        canRemoveBlocker: object.canRemoveBlocker
      };
    })
    .filter((entry): entry is NonNullable<PackagingReleaseResultWorkspaceSummary["drafts"]>[number] => entry !== undefined);
}

function summarizeFiles(value: JsonValue | undefined): PackagingReleaseResultWorkspaceSummary["files"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      const relativePath = safeRelativePath(object?.relativePath);
      const fileName = safeFileName(object?.fileName);
      if (object === undefined || relativePath === undefined || fileName === undefined) {
        return undefined;
      }
      return {
        role: typeof object.role === "string" ? object.role : "unknown",
        relativePath,
        fileName,
        ...(typeof object.sha256 === "string" ? { sha256: object.sha256 } : {}),
        ...(typeof object.sizeBytes === "number" ? { sizeBytes: object.sizeBytes } : {})
      };
    })
    .filter((entry): entry is NonNullable<PackagingReleaseResultWorkspaceSummary["files"]>[number] => entry !== undefined);
}

function buildInvalidReason(
  document: Record<string, JsonValue>,
  gateActions: PackagingReleaseResultWorkspaceSummary["gateActions"],
  drafts: PackagingReleaseResultWorkspaceSummary["drafts"],
  files: PackagingReleaseResultWorkspaceSummary["files"]
): string | undefined {
  if (document.evidenceKind !== "windows-release-result-workspace") {
    return "Windows release result workspace has an unexpected evidence kind";
  }
  if (document.productionReady !== false || document.rcCandidateReady !== false || document.unsignedDraft !== true) {
    return "Windows release result workspace must keep rcCandidateReady=false, productionReady=false, and unsignedDraft=true";
  }
  if (typeof document.status !== "string" || !knownStatus.has(document.status)) {
    return "Windows release result workspace has an unknown status";
  }
  if (document.workspaceDirectory !== "lumatrace-windows-release-result-workspace") {
    return "Windows release result workspace directory is not the expected relative directory";
  }
  if (gateActions === undefined || gateActions.length === 0) {
    return "Windows release result workspace has no gate actions";
  }
  if (drafts === undefined || drafts.length === 0) {
    return "Windows release result workspace has no draft entries";
  }
  if (files === undefined || files.length === 0) {
    return "Windows release result workspace has no file manifest";
  }
  if (gateActions.some((entry) => entry.requiresHumanReview !== true)) {
    return "Windows release result workspace contains a gate that is not marked for human review";
  }
  if (drafts.some((entry) => entry.canRemoveBlocker !== false || !entry.draftFile.endsWith(".draft.json"))) {
    return "Windows release result workspace drafts must be non-removing .draft.json files";
  }
  return undefined;
}

export function readPackagingReleaseResultWorkspace(
  sidecarManifestPath: string | undefined
): PackagingReleaseResultWorkspaceSummary {
  const workspacePath = candidateWorkspaceManifestPaths(sidecarManifestPath).find((candidate) => existsSync(candidate));
  if (workspacePath === undefined) {
    return {
      exists: false,
      valid: false,
      fileName: workspaceManifestFileName,
      reason: "Windows release result workspace manifest is missing"
    };
  }

  try {
    const text = readFileSync(workspacePath, "utf8");
    const document = sanitizePackagedDiagnostics(JSON.parse(text)) as Record<string, JsonValue>;
    const currentIntake = summarizeCurrentIntake(document.currentIntake);
    const gateActions = summarizeGateActions(document.gateActions);
    const drafts = summarizeDrafts(document.drafts);
    const files = summarizeFiles(document.files);
    const instructions = summarizeStringArray(document.instructions);
    const excludedFiles = summarizeStringArray(document.excludedFiles);
    const limitations = summarizeStringArray(document.limitations);
    const securityAssertions = asObject(document.securityAssertions);
    const reason = buildInvalidReason(document, gateActions, drafts, files);

    return {
      exists: true,
      valid: reason === undefined,
      fileName: workspaceManifestFileName,
      sizeBytes: statSync(workspacePath).size,
      ...(typeof document.evidenceKind === "string" ? { evidenceKind: document.evidenceKind } : {}),
      ...(typeof document.status === "string" ? { status: document.status } : {}),
      ...(typeof document.rcCandidateReady === "boolean" ? { rcCandidateReady: document.rcCandidateReady } : {}),
      ...(typeof document.productionReady === "boolean" ? { productionReady: document.productionReady } : {}),
      ...(typeof document.unsignedDraft === "boolean" ? { unsignedDraft: document.unsignedDraft } : {}),
      ...(typeof document.workspaceDirectory === "string" ? { workspaceDirectory: document.workspaceDirectory } : {}),
      ...(currentIntake !== undefined ? { currentIntake } : {}),
      ...(gateActions !== undefined
        ? {
            gateSummary: {
              total: gateActions.length,
              requiresHumanReview: gateActions.filter((entry) => entry.requiresHumanReview).length
            },
            gateActions
          }
        : {}),
      ...(drafts !== undefined
        ? {
            draftSummary: {
              total: drafts.length,
              cannotRemoveBlockers: drafts.filter((entry) => entry.canRemoveBlocker === false).length
            },
            drafts
          }
        : {}),
      ...(files !== undefined
        ? {
            fileSummary: {
              total: files.length,
              templates: files.filter((entry) => entry.relativePath.startsWith("templates/")).length,
              drafts: files.filter((entry) => entry.relativePath.startsWith("drafts/")).length
            },
            files
          }
        : {}),
      ...(instructions !== undefined ? { instructions } : {}),
      ...(excludedFiles !== undefined ? { excludedFiles } : {}),
      ...(securityAssertions !== undefined ? { securityAssertions } : {}),
      ...(limitations !== undefined ? { limitations } : {}),
      ...(reason === undefined ? {} : { reason })
    };
  } catch {
    return {
      exists: true,
      valid: false,
      fileName: workspaceManifestFileName,
      sizeBytes: statSync(workspacePath).size,
      reason: "Windows release result workspace manifest is not valid JSON"
    };
  }
}
