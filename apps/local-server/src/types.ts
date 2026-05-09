import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { MetricCollector, ToolStatus } from "@lumatrace/core";
import type { DiagnosticRecord, LumaTraceDatabase } from "@lumatrace/storage";
import type { DeviceService } from "./services/DeviceService";
import type { SessionService } from "./services/SessionService";
import type { MetricService } from "./services/MetricService";
import type { CapabilityService } from "./services/CapabilityService";
import type { ToolStatusService } from "./services/ToolStatusService";
import type { DiagnosticService } from "./services/DiagnosticService";
import type { ExportService } from "./services/ExportService";
import type { SessionRuntimeManager } from "./runtime/SessionRuntimeManager";
import type { LogRotationResult } from "./diagnostics/logMetadata";
import type { SidecarCrashState } from "./diagnostics/sidecarCrashRecovery";

export interface LocalServerOptions {
  dbPath?: string;
  packaged?: boolean;
  host?: string;
  port?: number;
  reportsDir?: string;
  diagnosticsDir?: string;
  logsDir?: string;
  sidecarManifestPath?: string;
  authToken?: string;
  parentPid?: number;
  database?: LumaTraceDatabase;
  enableLogger?: boolean;
  ringBufferSize?: number;
  metricBatchSize?: number;
  metricFlushIntervalMs?: number;
  androidCollector?: MetricCollector & {
    getToolStatus?: () => Promise<ToolStatus>;
  };
  enableAndroidCollector?: boolean;
  pcCollector?: MetricCollector & {
    getToolStatus?: () => Promise<ToolStatus>;
  };
  enablePcCollector?: boolean;
  iosCollector?: MetricCollector & {
    getToolStatus?: () => Promise<ToolStatus>;
  };
  enableIosCollector?: boolean;
}

export interface PackagedServerState {
  packaged: boolean;
  host: string;
  port: number;
  dbPath?: string;
  dataDir?: string;
  reportsDir?: string;
  diagnosticsDir?: string;
  logsDir?: string;
  sidecarManifestPath?: string;
  lastLogRotationResult?: LogRotationResult;
  sidecarCrashState?: SidecarCrashState;
  authRequired: boolean;
  sidecarPid?: number;
}

export interface ServerServices {
  deviceService: DeviceService;
  sessionService: SessionService;
  metricService: MetricService;
  capabilityService: CapabilityService;
  toolStatusService: ToolStatusService;
  diagnosticService: DiagnosticService;
  exportService: ExportService;
}

export interface LocalServerContext extends ServerServices {
  app: FastifyInstance;
  database: LumaTraceDatabase;
  runtimeManager: SessionRuntimeManager;
  startedAt: number;
  version: string;
  packaged: PackagedServerState;
  authToken?: string;
  activeSockets: Set<WebSocketConnection>;
  logger: FastifyBaseLogger;
}

export interface WebSocketConnection {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "close" | "error" | "message", listener: (...args: unknown[]) => void): void;
}

export type DiagnosticCreateInput = Omit<DiagnosticRecord, "id" | "timestampMs"> &
  Partial<Pick<DiagnosticRecord, "id" | "timestampMs">>;
