import type { LocalServerContext } from "../types";
import { sanitizePackagedPath } from "../config/packagedEnv";
import { detectTauriToolchain } from "./tauriToolchainDetection";
import { DEFAULT_LOG_ROTATION_POLICY, collectLogMetadata } from "./logMetadata";
import { readSidecarManifest } from "./packagedDiagnostics";
import { sanitizePackagedDiagnostics } from "./sanitizePackagedDiagnostics";
import { buildPackagedStorageStatus } from "./packagedStorageStatus";
import { readPackagingReleaseReadiness } from "./packagingReleaseReadiness";
import { readPackagingRcGate } from "./packagingRcGate";
import { readPackagingReleasePolicy } from "./packagingReleasePolicy";
import { readPackagingManualGuiQaHandoff } from "./packagingManualGuiQaHandoff";
import { readPackagingManualGuiQaResult } from "./packagingManualGuiQaResult";
import { readPackagingReleaseGateResults } from "./packagingReleaseGateResults";
import { readPackagingReleaseGateResultsImport } from "./packagingReleaseGateResultsImport";
import { readPackagingReleaseGateResultsSuite } from "./packagingReleaseGateResultsSuite";
import { readPackagingReleaseResultWorkspace } from "./packagingReleaseResultWorkspace";
import { buildWindowsRcStatus } from "./packagingWindowsRcStatus";

function summarizeDiagnostics(context: LocalServerContext): Record<string, unknown> {
  const records = context.diagnosticService.list({ limit: 100 });
  return {
    total: records.length,
    byLevel: records.reduce<Record<string, number>>((accumulator, record) => {
      accumulator[record.level] = (accumulator[record.level] ?? 0) + 1;
      return accumulator;
    }, {}),
    recent: records.slice(0, 10).map((record) =>
      sanitizePackagedDiagnostics({
        timestampMs: record.timestampMs,
        level: record.level,
        category: record.category,
        message: record.message
      })
    )
  };
}

export async function buildPackagedDiagnosticsExport(
  context: LocalServerContext,
  actualPort: number
): Promise<Record<string, unknown>> {
  const manifestValidation =
    context.packaged.sidecarManifestPath === undefined
      ? undefined
      : readSidecarManifest(context.packaged.sidecarManifestPath);
  const manifest = manifestValidation?.manifest;
  const toolchainStatus = await detectTauriToolchain();
  const toolStatuses = context.toolStatusService.listToolStatus();
  const logFiles = collectLogMetadata(context.packaged.logsDir, true);
  const storageStatus = buildPackagedStorageStatus(context);
  const releaseReadiness = readPackagingReleaseReadiness(context.packaged.sidecarManifestPath);
  const rcGate = readPackagingRcGate(context.packaged.sidecarManifestPath);
  const releasePolicy = readPackagingReleasePolicy(context.packaged.sidecarManifestPath);
  const manualGuiQaHandoff = readPackagingManualGuiQaHandoff(context.packaged.sidecarManifestPath);
  const manualGuiQaResult = readPackagingManualGuiQaResult(context.packaged.sidecarManifestPath);
  const releaseGateResults = readPackagingReleaseGateResults(context.packaged.sidecarManifestPath);
  const releaseGateResultsImport = readPackagingReleaseGateResultsImport(context.packaged.sidecarManifestPath);
  const releaseGateResultsSuite = readPackagingReleaseGateResultsSuite(context.packaged.sidecarManifestPath);
  const releaseResultWorkspace = readPackagingReleaseResultWorkspace(context.packaged.sidecarManifestPath);
  const windowsRcStatus = buildWindowsRcStatus({
    manifestValidation,
    manifest,
    releaseReadiness,
    rcGate,
    releasePolicy,
    manualGuiQaHandoff,
    manualGuiQaResult
  });
  const sidecarCrashState =
    context.packaged.sidecarCrashState === undefined
      ? undefined
      : {
          ...context.packaged.sidecarCrashState,
          lastKnownPort: actualPort,
          lastKnownAuthRequired: context.packaged.authRequired
        };
  const payload = {
    generatedAt: new Date().toISOString(),
    appVersion: context.version,
    platform: process.platform,
    arch: process.arch,
    toolchainStatus,
    sidecarManifest:
      manifest === undefined
        ? undefined
        : {
            valid: manifestValidation?.valid ?? false,
            name: manifest.name,
            version: manifest.version,
            artifactKind: manifest.artifactKind,
            targetTriple: manifest.targetTriple,
            fileName: manifest.fileName,
            sizeBytes: manifest.sizeBytes,
            sha256: manifest.sha256,
            nodeRequired: manifest.nodeRequired,
            productionReady: manifest.productionReady,
            limitations: manifest.limitations,
            noticesFile: manifest.noticesFile,
            noticesSha256: manifest.noticesSha256,
            thirdPartyNoticesFile: manifest.thirdPartyNoticesFile,
            thirdPartyNoticesSha256: manifest.thirdPartyNoticesSha256,
            licenseReviewStatus: manifest.licenseReviewStatus
          },
    sidecarStatus: {
      sidecarPid: context.packaged.sidecarPid,
      uptimeMs: Date.now() - context.startedAt
    },
    sidecarCrashState,
    crashRecovery: sidecarCrashState,
    packagedStatus: {
      packaged: context.packaged.packaged,
      host: context.packaged.host,
      port: actualPort,
      artifactKind: manifest?.artifactKind ?? "unknown",
      productionReady: manifest?.productionReady ?? false,
      releaseStatus: releaseReadiness.releaseStatus ?? "unknown"
    },
    releaseReadiness,
    releasePolicy,
    manualGuiQaHandoff,
    manualGuiQaResult,
    releaseGateResults,
    releaseGateResultsImport,
    releaseGateResultsSuite,
    releaseResultWorkspace,
    windowsRcStatus,
    rcGate,
    artifactKind: manifest?.artifactKind ?? "unknown",
    productionReady: manifest?.productionReady ?? false,
    auth: {
      required: context.packaged.authRequired,
      tokenPresent: context.authToken !== undefined,
      tokenRedacted: true
    },
    paths: {
      appLocalDataDirSanitized: sanitizePackagedPath(context.packaged.dataDir),
      appLogDirSanitized: sanitizePackagedPath(context.packaged.logsDir),
      dbPathSanitized: sanitizePackagedPath(context.packaged.dbPath),
      reportsDirSanitized: sanitizePackagedPath(context.packaged.reportsDir),
      diagnosticsDirSanitized: sanitizePackagedPath(context.packaged.diagnosticsDir)
    },
    logs: {
      rotationPolicy: DEFAULT_LOG_ROTATION_POLICY,
      logFiles,
      lastRotationResult: context.packaged.lastLogRotationResult
    },
    storage: storageStatus,
    limitations: {
      codeSigningConfigured: false,
      updaterConfigured: false,
      windowsRcStatus: windowsRcStatus.status,
      releasePolicyStatus: releasePolicy.status ?? "unknown",
      manualGuiQaHandoffStatus: manualGuiQaHandoff.status ?? "unknown",
      manualGuiQaResultStatus: manualGuiQaResult.status ?? (manualGuiQaResult.exists ? "invalid" : "missing"),
      manualGuiQaResultValid: manualGuiQaResult.valid,
      releaseGateResultsStatus: releaseGateResults.status ?? (releaseGateResults.exists ? "invalid" : "missing"),
      releaseGateResultsValid: releaseGateResults.valid,
      releaseGateResultsImportStatus:
        releaseGateResultsImport.status ?? (releaseGateResultsImport.exists ? "invalid" : "missing"),
      releaseGateResultsImportValid: releaseGateResultsImport.valid,
      releaseGateResultsSuiteStatus:
        releaseGateResultsSuite.status ?? (releaseGateResultsSuite.exists ? "invalid" : "missing"),
      releaseGateResultsSuiteValid: releaseGateResultsSuite.valid,
      releaseResultWorkspaceStatus:
        releaseResultWorkspace.status ?? (releaseResultWorkspace.exists ? "invalid" : "missing"),
      releaseResultWorkspaceValid: releaseResultWorkspace.valid,
      selfContainedSidecar: manifest?.artifactKind === "self-contained" && manifest.productionReady,
      productionReady: manifest?.productionReady ?? false
    },
    collectors: {
      mock: { available: true },
      android: toolStatuses.find((status) => status.toolName === "adb") ?? { status: "unknown" },
      pc: toolStatuses.find((status) => status.toolName === "PresentMon") ?? { status: "unknown" }
    },
    diagnosticsSummary: summarizeDiagnostics(context),
    warnings: [
      "Raw logs are not included.",
      "Auth tokens, full local paths, command lines, stack traces, raw CSV, logcat, and bugreport data are redacted or omitted."
    ]
  };

  return sanitizePackagedDiagnostics(payload);
}
