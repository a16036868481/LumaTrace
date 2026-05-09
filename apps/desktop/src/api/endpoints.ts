import { createApiClient } from "./client";
import type {
  CreateSessionInput,
  AndroidAppStartInput,
  AndroidAppStartResult,
  AndroidAppStopInput,
  AndroidAppStopResult,
  AndroidCacheStatusResponse,
  AndroidHealthResponse,
  Device,
  DiagnosticsExportFormat,
  DiagnosticRecord,
  DiagnosticsQuery,
  DownsampledMetricBucket,
  DownsampledMetricsQuery,
  EventMarker,
  ExportFormat,
  HealthResponse,
  IosTraceImportInput,
  IosTraceImportResponse,
  IosXctraceCaptureInput,
  IosXctraceCaptureResponse,
  MarkerInput,
  MetricAvailability,
  MetricEvent,
  MetricsQuery,
  PackagedShutdownResponse,
  PackagingDiagnosticsExportResponse,
  PackagedStatusResponse,
  PcPresentMonStatusResponse,
  PresentMonCaptureStatusResponse,
  Platform,
  Session,
  SessionsQuery,
  SessionReportResponse,
  Target,
  ToolStatus
} from "./types";

const api = createApiClient();

export function health(): Promise<HealthResponse> {
  return api.get<HealthResponse>("/api/health");
}

export function getPackagedStatus(): Promise<PackagedStatusResponse> {
  return api.get<PackagedStatusResponse>("/api/packaged/status");
}

export function exportPackagedDiagnostics(): Promise<PackagingDiagnosticsExportResponse> {
  return api.get<PackagingDiagnosticsExportResponse>("/api/packaged/diagnostics/export", {
    query: {
      format: "json"
    }
  });
}

export function shutdownPackagedServer(): Promise<PackagedShutdownResponse> {
  return api.post<PackagedShutdownResponse>("/api/packaged/shutdown");
}

export function getDevices(): Promise<Device[]> {
  return api.get<Device[]>("/api/devices");
}

export function getTargets(deviceId: string): Promise<Target[]> {
  return api.get<Target[]>(`/api/devices/${encodeURIComponent(deviceId)}/targets`);
}

export function startAndroidApp(
  deviceId: string,
  packageName: string,
  input: AndroidAppStartInput = {}
): Promise<AndroidAppStartResult> {
  return api.post<AndroidAppStartResult>(
    `/api/android/${encodeURIComponent(deviceId)}/apps/${encodeURIComponent(packageName)}/start`,
    input
  );
}

export function stopAndroidApp(
  deviceId: string,
  packageName: string,
  input: AndroidAppStopInput = {}
): Promise<AndroidAppStopResult> {
  return api.post<AndroidAppStopResult>(
    `/api/android/${encodeURIComponent(deviceId)}/apps/${encodeURIComponent(packageName)}/stop`,
    input
  );
}

export function getAndroidHealth(deviceId: string): Promise<AndroidHealthResponse> {
  return api.get<AndroidHealthResponse>(`/api/android/${encodeURIComponent(deviceId)}/health`);
}

export function getAndroidForegroundApp(deviceId: string): Promise<Target> {
  return api.get<Target>(`/api/android/${encodeURIComponent(deviceId)}/foreground-app`);
}

export function getAndroidCacheStatus(deviceId: string): Promise<AndroidCacheStatusResponse> {
  return api.get<AndroidCacheStatusResponse>(`/api/android/${encodeURIComponent(deviceId)}/cache/status`);
}

export function refreshAndroidCache(deviceId: string): Promise<AndroidCacheStatusResponse> {
  return api.post<AndroidCacheStatusResponse>(`/api/android/${encodeURIComponent(deviceId)}/cache/refresh`);
}

export function getPcPresentMonStatus(deviceId: string): Promise<PcPresentMonStatusResponse> {
  return api.get<PcPresentMonStatusResponse>(`/api/pc/${encodeURIComponent(deviceId)}/presentmon/status`);
}

export function getPresentMonCaptureStatus(sessionId: string): Promise<PresentMonCaptureStatusResponse> {
  return api.get<PresentMonCaptureStatusResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/presentmon/status`);
}

export function getCapabilities(platform?: Platform): Promise<MetricAvailability[]> {
  return api.get<MetricAvailability[]>("/api/capabilities", {
    query: {
      platform
    }
  });
}

export function createSession(input: CreateSessionInput): Promise<Session> {
  return api.post<Session>("/api/sessions", input);
}

export function getSessions(query: SessionsQuery = {}): Promise<Session[]> {
  return api.get<Session[]>("/api/sessions", {
    query: {
      limit: query.limit
    }
  });
}

export function getSession(sessionId: string): Promise<Session> {
  return api.get<Session>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function startSession(sessionId: string): Promise<Session> {
  return api.post<Session>(`/api/sessions/${encodeURIComponent(sessionId)}/start`);
}

export function pauseSession(sessionId: string): Promise<Session> {
  return api.post<Session>(`/api/sessions/${encodeURIComponent(sessionId)}/pause`);
}

export function stopSession(sessionId: string): Promise<Session> {
  return api.post<Session>(`/api/sessions/${encodeURIComponent(sessionId)}/stop`);
}

export function getMetrics(sessionId: string, query: MetricsQuery = {}): Promise<MetricEvent[]> {
  return api.get<MetricEvent[]>(`/api/sessions/${encodeURIComponent(sessionId)}/metrics`, {
    query: {
      ...query,
      metricNames: query.metricNames
    }
  });
}

export function getDownsampledMetrics(
  sessionId: string,
  query: DownsampledMetricsQuery = {}
): Promise<DownsampledMetricBucket[]> {
  return api.get<DownsampledMetricBucket[]>(`/api/sessions/${encodeURIComponent(sessionId)}/metrics/downsampled`, {
    query: {
      ...query,
      metricNames: query.metricNames
    }
  });
}

export function addMarker(sessionId: string, input: MarkerInput): Promise<EventMarker> {
  return api.post<EventMarker>(`/api/sessions/${encodeURIComponent(sessionId)}/markers`, input);
}

export function getMarkers(sessionId: string): Promise<EventMarker[]> {
  return api.get<EventMarker[]>(`/api/sessions/${encodeURIComponent(sessionId)}/markers`);
}

export function getReport(sessionId: string): Promise<SessionReportResponse> {
  return api.get<SessionReportResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/report`);
}

export function importIosTraceCsv(
  sessionId: string,
  input: IosTraceImportInput
): Promise<IosTraceImportResponse> {
  return api.post<IosTraceImportResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/ios/trace-import`,
    input
  );
}

export function captureIosXctrace(
  sessionId: string,
  input: IosXctraceCaptureInput
): Promise<IosXctraceCaptureResponse> {
  return api.post<IosXctraceCaptureResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/ios/xctrace-capture`,
    input
  );
}

export function exportSession(sessionId: string, format: ExportFormat): Promise<string> {
  return api.getText(`/api/sessions/${encodeURIComponent(sessionId)}/export`, {
    query: {
      format
    }
  });
}

export function getToolsStatus(): Promise<ToolStatus[]> {
  return api.get<ToolStatus[]>("/api/tools/status");
}

export function getDiagnostics(query: DiagnosticsQuery = {}): Promise<DiagnosticRecord[]> {
  const requestQuery: Record<string, string | number | boolean | undefined> = {
    sessionId: query.sessionId,
    deviceId: query.deviceId,
    level: query.level,
    limit: query.limit,
    fromTimestampMs: query.fromTimestampMs,
    toTimestampMs: query.toTimestampMs
  };
  return api.get<DiagnosticRecord[]>("/api/diagnostics", {
    query: requestQuery
  });
}

export function getSessionDiagnostics(sessionId: string): Promise<DiagnosticRecord[]> {
  return api.get<DiagnosticRecord[]>(`/api/sessions/${encodeURIComponent(sessionId)}/diagnostics`);
}

export function exportSessionDiagnostics(
  sessionId: string,
  format: DiagnosticsExportFormat
): Promise<string> {
  return api.getText(`/api/sessions/${encodeURIComponent(sessionId)}/diagnostics/export`, {
    query: {
      format
    }
  });
}
