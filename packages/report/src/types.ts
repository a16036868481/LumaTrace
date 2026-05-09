import type {
  Device,
  EventMarker,
  MetricAvailability,
  MetricEvent,
  ReportSummary,
  Session,
  Target,
  ToolStatus
} from "@lumatrace/core";
import type {
  DeviceRepository,
  DiagnosticRepository,
  DiagnosticRecord,
  MarkerRepository,
  MetricRepository,
  ReportRepository,
  SessionRepository,
  TargetRepository
} from "@lumatrace/storage";

export interface ReportInput {
  session: Session;
  device: Device;
  target: Target;
  metrics: MetricEvent[];
  markers: EventMarker[];
  availability?: MetricAvailability[];
  toolStatus?: ToolStatus[];
  generatedAt?: number;
  limitations?: string[];
  diagnostics?: DiagnosticRecord[];
}

export interface GeneratedReport {
  sessionId: string;
  generatedAt: number;
  summary: ReportSummary;
  json: string;
  csv: string;
  html: string;
  rawMetricCount: number;
  version: string;
}

export interface ReportFilePaths {
  htmlPath?: string;
  jsonPath?: string;
  csvPath?: string;
}

export interface ReportGeneratorOptions {
  version?: string;
  includeRawMetricsInJson?: boolean;
  includeRawMetricsInHtml?: boolean;
  maxHtmlMetricRows?: number;
  outputDir?: string;
  fileBaseName?: string;
  saveToRepository?: boolean;
}

export interface ReportGeneratorDependencies {
  reportRepository?: ReportRepository;
  metricRepository?: MetricRepository;
  markerRepository?: MarkerRepository;
  sessionRepository?: SessionRepository;
  deviceRepository?: DeviceRepository;
  targetRepository?: TargetRepository;
  diagnosticRepository?: DiagnosticRepository;
}

export interface AndroidReportDiagnosticsSection {
  androidDiagnosticsSummary: {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    byCode: Record<string, number>;
    warnings: number;
    errors: number;
    importantEvents: DiagnosticRecord[];
  };
  diagnosticsTimeline: DiagnosticRecord[];
  sourcePrecisionNotices: string[];
  fallbackNotices: string[];
  lifecycleEvents: DiagnosticRecord[];
  processEvents: DiagnosticRecord[];
  fpsProbeResult?: DiagnosticRecord;
  networkPrecisionNotice?: string;
}

export interface PcReportDiagnosticsSection {
  pcDiagnosticsSummary: {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    warnings: number;
    errors: number;
  };
  diagnosticsTimeline: DiagnosticRecord[];
  sourcePrecisionNotices: string[];
  presentMonCaptureStatus?: string;
  presentMonCompatibility?: Record<string, unknown>;
  csvRetentionSummary?: string;
  permissionNotices: string[];
  noDataReasons: string[];
}

export interface IosReportDiagnosticsSection {
  iosDiagnosticsSummary: {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    warnings: number;
    errors: number;
  };
  diagnosticsTimeline: DiagnosticRecord[];
  sourcePrecisionNotices: string[];
  noDataReasons: string[];
  importStatus?: string;
}

export interface ReportDocument {
  version: string;
  generatedAt: number;
  session: Session;
  device: Device;
  target: Target;
  summary: ReportSummary;
  markers: EventMarker[];
  availability: MetricAvailability[];
  toolStatus: ToolStatus[];
  rawMetricCount: number;
  limitations: string[];
  metrics?: MetricEvent[];
  androidDiagnostics?: AndroidReportDiagnosticsSection;
  pcDiagnostics?: PcReportDiagnosticsSection;
  iosDiagnostics?: IosReportDiagnosticsSection;
}

export interface ReportBuildResult {
  report: GeneratedReport;
  document: ReportDocument;
}
