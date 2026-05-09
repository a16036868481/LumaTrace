import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { sanitizePackagedPath } from "../config/packagedEnv";
import {
  DEFAULT_LOG_ROTATION_POLICY,
  listLogFiles,
  readSidecarManifest
} from "../diagnostics/packagedDiagnostics";
import { buildPackagedDiagnosticsExport } from "../diagnostics/packagedDiagnosticsExport";
import { buildPackagedStorageStatus } from "../diagnostics/packagedStorageStatus";
import { readPackagingReleaseReadiness } from "../diagnostics/packagingReleaseReadiness";
import { readPackagingRcGate } from "../diagnostics/packagingRcGate";
import { readPackagingReleasePolicy } from "../diagnostics/packagingReleasePolicy";
import { readPackagingManualGuiQaHandoff } from "../diagnostics/packagingManualGuiQaHandoff";
import { readPackagingManualGuiQaResult } from "../diagnostics/packagingManualGuiQaResult";
import { readPackagingReleaseGateResults } from "../diagnostics/packagingReleaseGateResults";
import { readPackagingReleaseGateResultsImport } from "../diagnostics/packagingReleaseGateResultsImport";
import { readPackagingReleaseGateResultsSuite } from "../diagnostics/packagingReleaseGateResultsSuite";
import { readPackagingReleaseResultWorkspace } from "../diagnostics/packagingReleaseResultWorkspace";
import { buildWindowsRcStatus } from "../diagnostics/packagingWindowsRcStatus";
import { ok } from "../utils/apiResponse";
import { AppError } from "../utils/errors";

function getActualPort(app: FastifyInstance, fallback: number): number {
  const address = app.server.address();
  return typeof address === "object" && address !== null ? address.port : fallback;
}

export async function registerPackagedRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get("/api/packaged/status", async () => {
    const actualPort = getActualPort(app, context.packaged.port);
    const manifestValidation =
      context.packaged.sidecarManifestPath === undefined
        ? undefined
        : readSidecarManifest(context.packaged.sidecarManifestPath);
    const manifest = manifestValidation?.manifest;
    const storage = buildPackagedStorageStatus(context);
    const sidecarCrashState = context.packaged.sidecarCrashState;
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

    return ok({
      packaged: context.packaged.packaged,
      host: context.packaged.host,
      port: actualPort,
      artifactKind: manifest?.artifactKind ?? "unknown",
      sidecarManifest:
        manifest === undefined
          ? undefined
          : {
              valid: manifestValidation?.valid ?? false,
              fileName: manifest.fileName,
              targetTriple: manifest.targetTriple,
              artifactKind: manifest.artifactKind,
              productionReady: manifest.productionReady,
              nodeRequired: manifest.nodeRequired,
              sizeBytes: manifest.sizeBytes,
              sha256: manifest.sha256,
              limitations: manifest.limitations,
              ...(manifest.runtimeDirectory === undefined ? {} : { runtimeDirectory: manifest.runtimeDirectory }),
              ...(manifest.runtimeSizeBytes === undefined ? {} : { runtimeSizeBytes: manifest.runtimeSizeBytes }),
              ...(manifest.runtimeFileCount === undefined ? {} : { runtimeFileCount: manifest.runtimeFileCount }),
              ...(manifest.bundledNodeVersion === undefined ? {} : { bundledNodeVersion: manifest.bundledNodeVersion }),
              ...(manifest.noticesFile === undefined ? {} : { noticesFile: manifest.noticesFile }),
              ...(manifest.noticesSha256 === undefined ? {} : { noticesSha256: manifest.noticesSha256 }),
              ...(manifest.thirdPartyNoticesFile === undefined
                ? {}
                : { thirdPartyNoticesFile: manifest.thirdPartyNoticesFile }),
              ...(manifest.thirdPartyNoticesSha256 === undefined
                ? {}
                : { thirdPartyNoticesSha256: manifest.thirdPartyNoticesSha256 }),
              ...(manifest.licenseReviewStatus === undefined
                ? {}
                : { licenseReviewStatus: manifest.licenseReviewStatus })
            },
      dataDir: sanitizePackagedPath(context.packaged.dataDir),
      logsDir: sanitizePackagedPath(context.packaged.logsDir),
      dbPath: sanitizePackagedPath(context.packaged.dbPath),
      reportsDir: sanitizePackagedPath(context.packaged.reportsDir),
      diagnosticsDir: sanitizePackagedPath(context.packaged.diagnosticsDir),
      authRequired: context.packaged.authRequired,
      auth: {
        required: context.packaged.authRequired,
        tokenPresent: context.authToken !== undefined,
        tokenPreview: context.authToken === undefined ? undefined : "<redacted>"
      },
      sidecarPid: context.packaged.sidecarPid,
      uptimeMs: Date.now() - context.startedAt,
      storage,
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
      sidecarCrashState:
        sidecarCrashState === undefined
          ? undefined
          : {
              ...sidecarCrashState,
              status: context.packaged.packaged ? sidecarCrashState.status : "stopped",
              lastKnownPort: actualPort,
              lastKnownAuthRequired: context.packaged.authRequired
            },
      crash:
        sidecarCrashState === undefined
          ? undefined
          : {
              status: context.packaged.packaged ? sidecarCrashState.status : "stopped",
              restartCount: sidecarCrashState.restartCount,
              maxRestarts: sidecarCrashState.maxRestarts,
              restartCooldownMs: sidecarCrashState.restartCooldownMs,
              lastCrashReason: sidecarCrashState.lastCrashReason
            },
      logs: {
        logsDirSanitized: sanitizePackagedPath(context.packaged.logsDir),
        logFiles: listLogFiles(context.packaged.logsDir),
        rotationPolicy: DEFAULT_LOG_ROTATION_POLICY,
        lastRotationResult: context.packaged.lastLogRotationResult
      },
      runtime: {
        runningSessions: 0,
        uptimeMs: Date.now() - context.startedAt
      },
      limitations: {
        productionReady: manifest?.productionReady ?? false,
        codeSigningConfigured: false,
        updaterConfigured: false,
        releaseStatus: releaseReadiness.releaseStatus ?? "unknown",
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
        rcStatus: rcGate.status ?? "unknown"
      },
      diagnosticsExportAvailable: true,
      packagingDiagnosticsSummary: {
        sanitizerEnabled: true,
        rawLogsIncluded: false,
        warningCount: context.packaged.lastLogRotationResult?.warnings.length ?? 0
      },
      sanitizerEnabled: true
    });
  });

  app.get("/api/packaged/diagnostics/export", async (request) => {
    const query = request.query as { format?: string };
    const format = query.format ?? "json";
    if (format !== "json") {
      throw new AppError("EXPORT_FORMAT_UNSUPPORTED", "Only JSON packaging diagnostics export is supported.", 400, {
        format
      });
    }

    return ok(await buildPackagedDiagnosticsExport(context, getActualPort(app, context.packaged.port)));
  });

  app.post("/api/packaged/shutdown", async () => {
    setTimeout(() => {
      void app.close();
    }, 0);
    return ok({
      shuttingDown: true
    });
  });
}
