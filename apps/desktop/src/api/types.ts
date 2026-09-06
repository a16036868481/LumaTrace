import type {
  Device,
  EventMarker,
  MetricAvailability,
  MetricEvent,
  Platform,
  ReportSummary,
  Session,
  Target,
  ToolStatus
} from "@lumatrace/core";

export type {
  Device,
  EventMarker,
  MetricAvailability,
  MetricEvent,
  Platform,
  ReportSummary,
  Session,
  Target,
  ToolStatus
};

export interface HealthResponse {
  status: "ok";
  version: string;
  uptimeMs: number;
}

export interface PackagedStatusResponse {
  packaged: boolean;
  host: string;
  port: number;
  artifactKind?: string;
  sidecarManifest?: {
    valid: boolean;
    fileName: string;
    targetTriple?: string;
    artifactKind: string;
    productionReady: boolean;
    nodeRequired: boolean;
    sizeBytes: number;
    sha256: string;
    limitations: string[];
    runtimeDirectory?: string;
    runtimeSizeBytes?: number;
    runtimeFileCount?: number;
    bundledNodeVersion?: string;
    noticesFile?: string;
    noticesSha256?: string;
    thirdPartyNoticesFile?: string;
    thirdPartyNoticesSha256?: string;
    licenseReviewStatus?: "draft_requires_review" | "complete";
  };
  dataDir?: string;
  logsDir?: string;
  dbPath?: string;
  reportsDir?: string;
  diagnosticsDir?: string;
  authRequired: boolean;
  auth?: {
    required: boolean;
    tokenPresent: boolean;
    tokenPreview?: string;
  };
  sidecarPid?: number;
  uptimeMs: number;
  storage?: {
    dbExists: boolean;
    migrationStatus: string;
    dbPathSanitized?: string;
    dbSizeBytes?: number;
    migrationVersions?: string[];
    lastMigrationAt?: number;
    sessionsCount?: number;
    reportsCount?: number;
    writable?: boolean;
    reportsDirExists?: boolean;
    diagnosticsDirExists?: boolean;
    reportsDirSanitized?: string;
    diagnosticsDirSanitized?: string;
    lastStorageError?: string;
    lastStorageErrorSanitized?: string;
  };
  releaseReadiness?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
    sizeBytes?: number;
    evidenceKind?: string;
    releaseStatus?: string;
    qaDraftStatus?: string;
    productionReady?: boolean;
    blockers?: Array<{
      code: string;
      reason: string;
      requiredForProduction: boolean;
    }>;
    checks?: Record<string, unknown>;
    reason?: string;
  };
  rcGate?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
    sizeBytes?: number;
    evidenceKind?: string;
    status?: string;
    rcCandidateReady?: boolean;
    productionReady?: boolean;
    unsignedDraft?: boolean;
    gates?: Array<{
      id: string;
      label: string;
      status: string;
      requiredForRelease: boolean;
      reason?: string;
    }>;
    blockers?: Array<{
      code: string;
      gateId: string;
      reason: string;
      requiredForRelease: boolean;
    }>;
    policy?: Record<string, unknown>;
    reason?: string;
  };
  releasePolicy?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
    sizeBytes?: number;
    evidenceKind?: string;
    status?: string;
    rcCandidateReady?: boolean;
    productionReady?: boolean;
    unsignedDraft?: boolean;
    policy?: Record<string, unknown>;
    blockers?: Array<{
      code: string;
      reason: string;
      requiredForRc: boolean;
    }>;
    securityBoundaries?: Record<string, unknown>;
    reason?: string;
  };
  manualGuiQaHandoff?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
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
    securityAssertions?: Record<string, unknown>;
    limitations?: string[];
    reason?: string;
  };
  manualGuiQaResult?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
    sizeBytes?: number;
    evidenceKind?: string;
    status?: string;
    productionReady?: boolean;
    unsignedDraft?: boolean;
    sourceChecklist?: {
      path?: string;
      itemCount?: number;
    };
    reviewer?: {
      namePresent: boolean;
      completedAtPresent: boolean;
      environmentPresent: boolean;
    };
    stepSummary?: {
      total: number;
      passed: number;
      failed: number;
      blocked: number;
      pending: number;
      unknown: number;
    };
    securityAssertions?: Record<string, unknown>;
    limitations?: string[];
    reason?: string;
  };
  releaseGateResults?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
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
    results?: Array<{
      gate: string;
      blockerCode: string;
      resultFile: string;
      templateFile: string;
      status: string;
      canRemoveBlocker: boolean;
      verifierCommand: string;
      rcGateSmokeCommand: string;
      sha256?: string;
      sizeBytes?: number;
      verifierExitCode?: number | null;
      reason: string;
    }>;
    nextCommands?: string[];
    securityAssertions?: Record<string, unknown>;
    limitations?: string[];
    reason?: string;
  };
  releaseGateResultsImport?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
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
    results?: Array<{
      gate: string;
      blockerCode: string;
      resultFile: string;
      templateFile: string;
      sourceFile: string;
      status: string;
      copied: boolean;
      verifierCommand: string;
      rcGateSmokeCommand: string;
      sha256?: string;
      sizeBytes?: number;
      verifierExitCode?: number | null;
      reason: string;
    }>;
    ignoredFiles?: string[];
    refreshedIntake?: {
      fileName: string;
      status: string;
      validResults: number;
      invalidResults: number;
      missingResults: number;
    };
    nextCommands?: string[];
    securityAssertions?: Record<string, unknown>;
    limitations?: string[];
    reason?: string;
  };
  releaseGateResultsSuite?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
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
    cases?: Array<{
      name: string;
      status: string;
      expectedIntakeStatus?: string;
    }>;
    securityAssertions?: Record<string, unknown>;
    limitations?: string[];
    reason?: string;
  };
  releaseResultWorkspace?: {
    exists: boolean;
    valid: boolean;
    fileName: string;
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
    securityAssertions?: Record<string, unknown>;
    limitations?: string[];
    reason?: string;
  };
  windowsRcStatus?: {
    status: "missing_evidence" | "blocked" | "ready_for_rc_review";
    rcCandidateReady: boolean;
    productionReady: false;
    evidence: {
      sidecarManifestValid: boolean;
      artifactKind: string;
      selfContainedSidecar: boolean;
      sidecarProductionReady: boolean;
      licenseReviewStatus: string;
      releaseReadinessValid: boolean;
      rcGateValid: boolean;
      releasePolicyValid: boolean;
      manualGuiQaHandoffValid: boolean;
      manualGuiQaResultValid: boolean;
      manualGuiQaResultStatus: string;
    };
    gateCounts: {
      total: number;
      passed: number;
      blocked: number;
      missing: number;
      unknown: number;
    };
    blockers: Array<{
      code: string;
      source: string;
      reason: string;
      requiredForRc: boolean;
    }>;
    nextActions: string[];
    warnings: string[];
  };
  sidecarCrashState?: {
    status: string;
    pid?: number;
    startedAt?: number;
    exitedAt?: number;
    exitCode?: number;
    signal?: string;
    restartCount: number;
    maxRestarts: number;
    restartCooldownMs: number;
    nextRestartAllowedAt?: number;
    lastError?: string;
    lastStdoutExcerptSanitized?: string;
    lastStderrExcerptSanitized?: string;
    lastCrashReason?: {
      reasonCode: string;
      userMessage: string;
      suggestedAction: string;
      severity: string;
      sanitizedEvidence?: string;
    };
    lastKnownPort?: number;
    lastKnownAuthRequired?: boolean;
    diagnosticsId?: string;
  };
  crash?: {
    status: string;
    restartCount: number;
    maxRestarts: number;
    restartCooldownMs: number;
    lastCrashReason?: {
      reasonCode: string;
      userMessage: string;
      suggestedAction: string;
      severity: string;
      sanitizedEvidence?: string;
    };
  };
  logs?: {
    logsDirSanitized?: string;
    logFiles: Array<{
      name: string;
      sizeBytes: number;
      rotated: boolean;
      excerpt?: string;
    }>;
    rotationPolicy: {
      maxFileSizeBytes: number;
      maxFiles: number;
      rotateOnStartup?: boolean;
      rotateWhenThresholdExceeded?: boolean;
      deleteOldest?: boolean;
    };
    lastRotationResult?: {
      ok: boolean;
      rotatedFiles: string[];
      warnings: string[];
    };
  };
  runtime?: {
    runningSessions: number;
    uptimeMs: number;
  };
  limitations?: {
    productionReady: boolean;
    codeSigningConfigured: boolean;
    updaterConfigured: boolean;
    releaseStatus?: string;
    windowsRcStatus?: string;
    rcStatus?: string;
    releasePolicyStatus?: string;
    manualGuiQaHandoffStatus?: string;
    manualGuiQaResultStatus?: string;
    manualGuiQaResultValid?: boolean;
    releaseGateResultsStatus?: string;
    releaseGateResultsValid?: boolean;
    releaseGateResultsImportStatus?: string;
    releaseGateResultsImportValid?: boolean;
    releaseGateResultsSuiteStatus?: string;
    releaseGateResultsSuiteValid?: boolean;
    releaseResultWorkspaceStatus?: string;
    releaseResultWorkspaceValid?: boolean;
  };
  diagnosticsExportAvailable?: boolean;
  packagingDiagnosticsSummary?: {
    sanitizerEnabled: boolean;
    rawLogsIncluded: boolean;
    warningCount: number;
  };
  sanitizerEnabled?: boolean;
}

export interface PackagedShutdownResponse {
  shuttingDown: boolean;
}

export type PackagingDiagnosticsExportResponse = Record<string, unknown>;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorPayload;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface CreateSessionInput {
  name?: string;
  deviceId: string;
  targetId: string;
  sampleIntervalMs?: number;
  config?: Record<string, unknown>;
}

export interface AndroidAppStartInput {
  launcherComponent?: string;
  allowMonkeyFallback?: boolean;
  waitForPid?: boolean;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AndroidAppStartResult {
  ok: boolean;
  method: "am_start" | "monkey" | "none";
  launcherComponent?: string;
  pid?: number;
  durationMs: number;
  warnings: string[];
  diagnostics: string[];
}

export interface AndroidAppStopInput {
  waitUntilStopped?: boolean;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AndroidAppStopResult {
  ok: boolean;
  method: "am_force_stop";
  durationMs: number;
  stopped?: boolean;
  warnings: string[];
  diagnostics: string[];
}

export interface AndroidHealthResponse {
  deviceId: string;
  adb: {
    status?: string;
    version?: string;
    reason?: string;
    suggestedAction?: string;
  };
  device: {
    state?: string;
    authorized?: boolean;
    offline?: boolean;
    unauthorized?: boolean;
  };
  cache?: unknown;
  knownLimitations?: string[];
}

export interface AndroidCacheStatusResponse {
  deviceId?: string;
  launcher: unknown[];
  deviceInfo: unknown[];
}

export interface PresentMonCompatibilityResponse {
  version?: string;
  supportsOutputFile?: boolean;
  supportsTimedCapture?: boolean;
  supportsProcessIdFilter?: boolean;
  supportsProcessNameFilter?: boolean;
  supportsTerminateAfterTimer?: boolean;
  warnings?: string[];
  recommendedArgsStyle?: string;
  unsupportedReason?: string;
}

export interface PcPresentMonStatusResponse {
  toolStatus: ToolStatus;
  compatibility?: PresentMonCompatibilityResponse | null;
  limitations?: string[];
}

export interface PresentMonCaptureStatusResponse {
  status:
    | "idle"
    | "tool_missing"
    | "planning"
    | "starting"
    | "capturing"
    | "parsing_csv"
    | "matching_target"
    | "mapping_metrics"
    | "completed"
    | "no_data"
    | "permission_limited"
    | "failed"
    | "aborted";
  sessionId?: string;
  targetId?: string;
  pid?: number;
  processName?: string;
  startedAt?: number;
  updatedAt: number;
  elapsedMs?: number;
  progressPercent?: number;
  captureDurationMs?: number;
  outputFilePathSanitized?: string;
  rawRowCount?: number;
  matchedRowCount?: number;
  metricCount?: number;
  reason?: string;
  warnings: string[];
  diagnostics: unknown[];
}

export interface SessionsQuery {
  limit?: number;
}

export interface DeleteSessionResponse {
  sessionId: string;
  deleted: true;
}

export interface DeleteSessionsResponse {
  deletedCount: number;
  skippedSessionIds: string[];
}

export interface MetricsQuery {
  fromTimestampMs?: number;
  toTimestampMs?: number;
  metricNames?: string[];
  limit?: number;
  offset?: number;
}

export interface DownsampledMetricsQuery extends MetricsQuery {
  bucketSizeMs?: number;
}

export interface DownsampledMetricBucket {
  sessionId: string;
  metricName: string;
  bucketStartMs: number;
  bucketEndMs: number;
  count: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
  p50Value?: number;
  p95Value?: number;
  source?: string;
  precision?: MetricEvent["precision"];
  tags?: Record<string, unknown>;
}

export interface MarkerInput {
  timestampMs?: number;
  label: string;
  description?: string;
  tags?: Record<string, string | number | boolean>;
}

export interface SessionReportResponse {
  summary: ReportSummary;
  cached: boolean;
  rawMetricCount: number;
}

export type ExportFormat = "json" | "csv" | "html";

export interface DiagnosticRecord {
  id: string;
  timestampMs: number;
  level: "debug" | "info" | "warn" | "error";
  category: string;
  message: string;
  details?: unknown;
  sessionId?: string;
  deviceId?: string;
}

export interface DiagnosticsQuery {
  sessionId?: string;
  deviceId?: string;
  level?: DiagnosticRecord["level"];
  limit?: number;
  fromTimestampMs?: number;
  toTimestampMs?: number;
}

export type DiagnosticsExportFormat = "json" | "html";

export interface SessionStatusMessage {
  type: "session_status";
  data: {
    sessionId: string;
    status: Session["status"];
  };
}

export interface MetricMessage {
  type: "metric";
  data: MetricEvent;
}

export interface SessionStoppedMessage {
  type: "session_stopped";
  data: {
    sessionId: string;
  };
}

export interface StreamErrorMessage {
  type: "error";
  error: ApiErrorPayload;
}

export type SessionStreamMessage =
  | SessionStatusMessage
  | MetricMessage
  | SessionStoppedMessage
  | StreamErrorMessage;
