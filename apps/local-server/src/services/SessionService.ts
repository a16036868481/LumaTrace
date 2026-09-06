import type { EventMarker, Session } from "@lumatrace/core";
import type {
  MarkerRepository,
  MetricRepository,
  ReportRepository,
  SessionRepository
} from "@lumatrace/storage";
import type { GeneratedReport, ReportGenerator } from "@lumatrace/report";
import { sanitizeFileBaseName } from "@lumatrace/report";
import type { DeviceService } from "./DeviceService";
import type { DiagnosticService } from "./DiagnosticService";
import type { SessionRuntimeManager } from "../runtime/SessionRuntimeManager";
import {
  buildTimestampedSessionLog,
  shouldExportSessionLog,
  writeSessionLog
} from "./SessionLogExporter";
import {
  buildSessionOutputDirectory,
  SESSION_REPORT_FOLDER_CREATED_AT_CONFIG_KEY,
  SESSION_REPORT_FOLDER_LABEL_CONFIG_KEY
} from "./SessionOutputDirectory";
import { AppError } from "../utils/errors";
import { createId } from "../utils/ids";

export interface CreateSessionInput {
  name?: string;
  deviceId?: string;
  targetId?: string;
  sampleIntervalMs?: number;
  config?: Record<string, unknown>;
}

export interface MarkerInput {
  timestampMs?: number;
  label?: string;
  description?: string;
  tags?: Record<string, string | number | boolean>;
}

export interface SessionReportResponse {
  summary: unknown;
  cached: boolean;
  rawMetricCount: number;
}

export interface DeleteSessionResponse {
  sessionId: string;
  deleted: true;
}

export interface DeleteSessionsResponse {
  deletedCount: number;
  skippedSessionIds: string[];
}

function sanitizeConfig(config: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (config === undefined) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (/token|password|secret|cookie/i.test(key)) {
      sanitized[key] = "<redacted>";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class SessionService {
  private readonly deviceService: DeviceService;
  private readonly sessionRepository: SessionRepository;
  private readonly markerRepository: MarkerRepository;
  private readonly metricRepository: MetricRepository;
  private readonly reportRepository: ReportRepository;
  private readonly runtimeManager: SessionRuntimeManager;
  private readonly reportGenerator: ReportGenerator;
  private readonly diagnosticService: DiagnosticService;
  private readonly reportOutputDir: string | undefined;

  constructor(options: {
    deviceService: DeviceService;
    sessionRepository: SessionRepository;
    markerRepository: MarkerRepository;
    metricRepository: MetricRepository;
    reportRepository: ReportRepository;
    runtimeManager: SessionRuntimeManager;
    reportGenerator: ReportGenerator;
    diagnosticService: DiagnosticService;
    reportOutputDir?: string;
  }) {
    this.deviceService = options.deviceService;
    this.sessionRepository = options.sessionRepository;
    this.markerRepository = options.markerRepository;
    this.metricRepository = options.metricRepository;
    this.reportRepository = options.reportRepository;
    this.runtimeManager = options.runtimeManager;
    this.reportGenerator = options.reportGenerator;
    this.diagnosticService = options.diagnosticService;
    this.reportOutputDir = options.reportOutputDir;
  }

  async createSession(input: CreateSessionInput): Promise<Session> {
    if (input.deviceId === undefined || input.deviceId.length === 0) {
      throw new AppError("INVALID_REQUEST", "deviceId is required.", 400);
    }
    if (input.targetId === undefined || input.targetId.length === 0) {
      throw new AppError("INVALID_REQUEST", "targetId is required.", 400);
    }

    const device = await this.deviceService.getDevice(input.deviceId);
    if (device === null) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${input.deviceId}`, 404, {
        deviceId: input.deviceId
      });
    }

    const target = await this.deviceService.getTarget(input.deviceId, input.targetId);
    if (target === null) {
      throw new AppError("TARGET_NOT_FOUND", `Target not found: ${input.targetId}`, 404, {
        targetId: input.targetId
      });
    }

    const createdAtMs = Date.now();
    const session: Session = {
      id: createId("session"),
      name: input.name ?? `Session ${new Date(createdAtMs).toISOString()}`,
      deviceId: input.deviceId,
      targetId: input.targetId,
      sampleIntervalMs: input.sampleIntervalMs ?? 1000,
      status: "created"
    };

    session.config = {
      ...(sanitizeConfig(input.config) ?? {}),
      [SESSION_REPORT_FOLDER_LABEL_CONFIG_KEY]: target.name,
      [SESSION_REPORT_FOLDER_CREATED_AT_CONFIG_KEY]: createdAtMs
    };

    this.sessionRepository.create(session);
    return session;
  }

  getSession(id: string): Session {
    const session = this.sessionRepository.getById(id);
    if (session === null) {
      throw new AppError("SESSION_NOT_FOUND", `Session not found: ${id}`, 404, { sessionId: id });
    }

    return session;
  }

  listSessions(limit = 20): Session[] {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return this.sessionRepository.list(boundedLimit);
  }

  deleteSession(id: string): DeleteSessionResponse {
    const session = this.getSession(id);
    if (
      session.status === "running" ||
      session.status === "paused" ||
      this.runtimeManager.getRuntime(id) !== undefined
    ) {
      throw new AppError("SESSION_ACTIVE", "Active sessions cannot be deleted.", 409, {
        sessionId: id,
        status: session.status
      });
    }

    this.deleteStoredSession(id);
    return {
      sessionId: id,
      deleted: true
    };
  }

  deleteAllSessions(): DeleteSessionsResponse {
    const sessions = this.sessionRepository.listAll();
    const skippedSessionIds: string[] = [];
    let deletedCount = 0;

    for (const session of sessions) {
      if (
        session.status === "running" ||
        session.status === "paused" ||
        this.runtimeManager.getRuntime(session.id) !== undefined
      ) {
        skippedSessionIds.push(session.id);
        continue;
      }
      this.deleteStoredSession(session.id);
      deletedCount += 1;
    }

    return {
      deletedCount,
      skippedSessionIds
    };
  }

  listMarkers(sessionId: string): EventMarker[] {
    this.getSession(sessionId);
    return this.markerRepository.listBySession(sessionId);
  }

  async startSession(id: string): Promise<Session> {
    const session = this.getSession(id);
    if (session.status === "running") {
      throw new AppError("SESSION_ALREADY_RUNNING", "Session is already running.", 409, {
        sessionId: id
      });
    }

    const runtime = await this.runtimeManager.startSession(session);
    return runtime.getSession();
  }

  async pauseSession(id: string): Promise<Session> {
    this.getSession(id);
    const runtime = this.runtimeManager.getRuntime(id);
    if (runtime === undefined) {
      throw new AppError("SESSION_NOT_RUNNING", "Session runtime is not running.", 409, {
        sessionId: id
      });
    }

    await runtime.pause();
    return this.getSession(id);
  }

  async stopSession(id: string): Promise<Session> {
    const session = this.getSession(id);
    const runtime = this.runtimeManager.getRuntime(id);
    if (runtime !== undefined) {
      await this.runtimeManager.stopSession(id);
    } else if (session.status !== "stopped") {
      this.sessionRepository.updateStatus(id, "stopped", { endedAt: Date.now() });
    }

    this.syncCollectorDiagnostics(id);
    await this.generateAndWriteReport(id);
    return this.getSession(id);
  }

  addMarker(sessionId: string, input: MarkerInput): EventMarker {
    this.getSession(sessionId);
    if (input.label === undefined || input.label.length === 0) {
      throw new AppError("INVALID_REQUEST", "label is required.", 400);
    }

    const marker: EventMarker = {
      id: createId("marker"),
      sessionId,
      timestampMs: input.timestampMs ?? Date.now(),
      label: input.label
    };

    if (input.description !== undefined) {
      marker.description = input.description;
    }
    if (input.tags !== undefined) {
      marker.tags = input.tags;
    }

    this.markerRepository.create(marker);
    return marker;
  }

  getReport(sessionId: string): SessionReportResponse {
    this.getSession(sessionId);
    this.syncCollectorDiagnostics(sessionId);
    const cached = this.reportRepository.get(sessionId);
    if (cached !== null) {
      return {
        summary: cached.summary,
        cached: true,
        rawMetricCount: this.metricRepository.countRaw(sessionId)
      };
    }

    const report = this.reportGenerator.generateFromStorage(sessionId, { saveToRepository: true });
    return {
      summary: report.summary,
      cached: false,
      rawMetricCount: report.rawMetricCount
    };
  }

  private deleteStoredSession(sessionId: string): void {
    this.diagnosticService.deleteBySession(sessionId);
    this.runtimeManager.getRingBuffer().clear(sessionId);
    this.sessionRepository.delete(sessionId);
  }

  private syncCollectorDiagnostics(sessionId: string): void {
    for (const event of this.deviceService.listAndroidDiagnostics({ sessionId })) {
      this.diagnosticService.createFromAndroidEvent(event);
    }
    for (const event of this.deviceService.listPcDiagnostics({ sessionId })) {
      this.diagnosticService.createFromPcEvent(event);
    }
  }

  private sanitizeReportOutputError(message: string): string {
    if (this.reportOutputDir === undefined) {
      return message;
    }
    return message.replaceAll(this.reportOutputDir, "<report-output-dir>");
  }

  private async generateAndWriteReport(sessionId: string): Promise<GeneratedReport> {
    const session = this.getSession(sessionId);
    const report = this.reportGenerator.generateFromStorage(sessionId, { saveToRepository: true });
    if (this.reportOutputDir === undefined) {
      return report;
    }

    const sessionOutputDir = buildSessionOutputDirectory(
      this.reportOutputDir,
      session,
      report.generatedAt
    );
    const fileBaseName = sanitizeFileBaseName("report");

    try {
      await this.reportGenerator.writeFiles(report, {
        outputDir: sessionOutputDir,
        fileBaseName,
        saveToRepository: true
      });
      this.diagnosticService.create({
        level: "info",
        category: "report",
        sessionId,
        message: "Report files were written to the test's report folder.",
        details: {
          reportOutputDir: "<report-output-dir>"
        }
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.diagnosticService.create({
        level: "warn",
        category: "report",
        sessionId,
        message: "Report files could not be written to the configured report output directory.",
        details: {
          reason: this.sanitizeReportOutputError(message)
        }
      });
    }

    if (shouldExportSessionLog(session.config)) {
      try {
        const device = await this.deviceService.getDevice(session.deviceId);
        const androidLog =
          device?.platform === "android"
            ? this.deviceService.drainAndroidSessionLog(sessionId)
            : undefined;
        if (device?.platform === "android" && androidLog === undefined) {
          throw new Error("ADB logcat was requested but no log was captured.");
        }

        const logSource = androidLog?.source ?? "lumatrace:session-events";
        await writeSessionLog({
          outputDir: sessionOutputDir,
          fileName: androidLog?.fileName ?? `${device?.platform ?? "session"}-session.log`,
          content:
            androidLog?.content ??
            buildTimestampedSessionLog({
              diagnostics: this.diagnosticService.list({ sessionId, limit: 1000 })
            })
        });
        this.diagnosticService.create({
          level: "info",
          category: "report",
          sessionId,
          message:
            androidLog === undefined
              ? "A timestamped LumaTrace session log was written beside the test report files."
              : "A sanitized ADB logcat file was written beside the test report files.",
          details: {
            reportOutputDir: "<report-output-dir>",
            logSource,
            ...(androidLog === undefined ? {} : { truncated: androidLog.truncated })
          }
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        this.diagnosticService.create({
          level: "warn",
          category: "report",
          sessionId,
          message: "The requested session log could not be written to the report output directory.",
          details: {
            reason: this.sanitizeReportOutputError(message)
          }
        });
      }
    }

    return report;
  }
}
