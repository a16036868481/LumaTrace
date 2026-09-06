import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { AndroidCollector } from "@lumatrace/collectors-android";
import { MockCollector } from "@lumatrace/collectors-mock";
import { PcCollector } from "@lumatrace/collectors-pc";
import {
  DeviceRepository,
  DiagnosticRepository,
  MarkerRepository,
  MetricRepository,
  LumaTraceDatabase,
  ReportRepository,
  SessionRepository,
  TargetRepository,
  ToolStatusRepository
} from "@lumatrace/storage";
import { ReportGenerator } from "@lumatrace/report";
import type { LocalServerContext, LocalServerOptions } from "./types";
import { CollectorRegistry } from "./runtime/CollectorRegistry";
import { MetricRingBuffer } from "./runtime/MetricRingBuffer";
import { SessionRuntimeManager } from "./runtime/SessionRuntimeManager";
import { DeviceService } from "./services/DeviceService";
import { SessionService } from "./services/SessionService";
import { MetricService } from "./services/MetricService";
import { CapabilityService } from "./services/CapabilityService";
import { ToolStatusService } from "./services/ToolStatusService";
import { DiagnosticService } from "./services/DiagnosticService";
import { ExportService } from "./services/ExportService";
import { sendError } from "./utils/apiResponse";
import { AppError, errorToApiError } from "./utils/errors";
import { registerLocalCorsMiddleware } from "./middleware/localCorsMiddleware";
import { registerLocalAuthMiddleware } from "./middleware/localAuthMiddleware";
import { registerHealthRoutes } from "./routes/health";
import { registerDeviceRoutes } from "./routes/devices";
import { registerCapabilityRoutes } from "./routes/capabilities";
import { registerSessionRoutes } from "./routes/sessions";
import { registerExportRoutes } from "./routes/exports";
import { registerToolRoutes } from "./routes/tools";
import { registerDiagnosticRoutes } from "./routes/diagnostics";
import { registerAndroidRoutes } from "./routes/android";
import { registerPcRoutes } from "./routes/pc";
import { registerPackagedRoutes } from "./routes/packaged";
import { registerSessionStreamRoutes } from "./ws/sessionStream";
import { rotateLogs } from "./diagnostics/logMetadata";
import { createSidecarCrashState } from "./diagnostics/sidecarCrashRecovery";

const SERVER_VERSION = "mvp-a";

export async function createServer(options: LocalServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.enableLogger ?? false
  });

  await app.register(websocket, {
    options: {
      handleProtocols: (protocols) => {
        const requested = Array.from(protocols);
        return requested.includes("lumatrace") ? "lumatrace" : requested[0] ?? false;
      }
    }
  });

  const database =
    options.database ??
    new LumaTraceDatabase(options.dbPath === undefined ? {} : { dbPath: options.dbPath });
  const deviceRepository = new DeviceRepository(database);
  const targetRepository = new TargetRepository(database);
  const sessionRepository = new SessionRepository(database);
  const metricRepository = new MetricRepository(database);
  const markerRepository = new MarkerRepository(database);
  const reportRepository = new ReportRepository(database);
  const toolStatusRepository = new ToolStatusRepository(database);
  const diagnosticRepository = new DiagnosticRepository(database);

  // A runtime only lives inside this sidecar process. Any persisted active status at startup
  // belongs to an interrupted previous process and must not remain permanently undeletable.
  sessionRepository.finalizeInterruptedSessions();

  const collectorRegistry = new CollectorRegistry();
  collectorRegistry.register(new MockCollector({ seed: "local-server-mock" }));
  const androidCollector =
    options.enableAndroidCollector === false
      ? undefined
      : options.androidCollector ?? new AndroidCollector();
  if (androidCollector !== undefined) {
    collectorRegistry.register(androidCollector);
    try {
      const getToolStatus = androidCollector.getToolStatus;
      if (getToolStatus !== undefined) {
        toolStatusRepository.upsert(await getToolStatus.call(androidCollector));
      }
    } catch {
      toolStatusRepository.upsert({
        toolName: "adb",
        status: "unknown",
        reason: "Android adb detection failed during local-server startup.",
        suggestedAction: "Check Android SDK Platform Tools installation."
      });
    }
  }
  const pcCollector = options.enablePcCollector === false ? undefined : options.pcCollector ?? new PcCollector();
  if (pcCollector !== undefined) {
    collectorRegistry.register(pcCollector);
    try {
      const getToolStatus = pcCollector.getToolStatus;
      if (getToolStatus !== undefined) {
        toolStatusRepository.upsert(await getToolStatus.call(pcCollector));
      }
    } catch {
      toolStatusRepository.upsert({
        toolName: "PresentMon",
        status: "unknown",
        reason: "PresentMon detection failed during local-server startup.",
        suggestedAction: "Install PresentMon or set LUMATRACE_PRESENTMON_PATH."
      });
    }
  }
  const ringBuffer = new MetricRingBuffer(options.ringBufferSize ?? 1000);
  const diagnosticService = new DiagnosticService(diagnosticRepository);
  const runtimeManager = new SessionRuntimeManager({
    collectorRegistry,
    metricRepository,
    sessionRepository,
    diagnosticService,
    ringBuffer,
    ...(options.metricBatchSize === undefined ? {} : { metricBatchSize: options.metricBatchSize }),
    ...(options.metricFlushIntervalMs === undefined
      ? {}
      : { metricFlushIntervalMs: options.metricFlushIntervalMs })
  });

  const deviceService = new DeviceService(collectorRegistry, deviceRepository, targetRepository);
  const reportGenerator = new ReportGenerator({
    reportRepository,
    metricRepository,
    markerRepository,
    sessionRepository,
    deviceRepository,
    targetRepository,
    diagnosticRepository
  });
  const metricService = new MetricService(metricRepository);
  const capabilityService = new CapabilityService(deviceService);
  const toolStatusService = new ToolStatusService(toolStatusRepository);
  const exportService = new ExportService(reportGenerator);
  const sessionService = new SessionService({
    deviceService,
    sessionRepository,
    markerRepository,
    metricRepository,
    reportRepository,
    runtimeManager,
    reportGenerator,
    diagnosticService,
    ...(options.reportsDir === undefined ? {} : { reportOutputDir: options.reportsDir })
  });

  const context: LocalServerContext = {
    app,
    database,
    runtimeManager,
    startedAt: Date.now(),
    version: SERVER_VERSION,
    packaged: {
      packaged: options.packaged === true,
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 3100,
      ...(options.dbPath === undefined ? {} : { dbPath: options.dbPath }),
      ...(options.dbPath === undefined ? {} : { dataDir: options.dbPath.replace(/[\\/][^\\/]*$/, "") }),
      ...(options.reportsDir === undefined ? {} : { reportsDir: options.reportsDir }),
      ...(options.diagnosticsDir === undefined ? {} : { diagnosticsDir: options.diagnosticsDir }),
      ...(options.logsDir === undefined ? {} : { logsDir: options.logsDir }),
      ...(options.sidecarManifestPath === undefined ? {} : { sidecarManifestPath: options.sidecarManifestPath }),
      ...(options.logsDir === undefined ? {} : { lastLogRotationResult: rotateLogs(options.logsDir) }),
      sidecarCrashState: createSidecarCrashState({
        status: options.packaged === true ? "running" : "stopped",
        ...(options.parentPid === undefined ? {} : { pid: options.parentPid }),
        startedAt: Date.now(),
        lastKnownPort: options.port ?? 3100,
        lastKnownAuthRequired: options.authToken !== undefined
      }),
      authRequired: options.authToken !== undefined,
      ...(options.parentPid === undefined ? {} : { sidecarPid: options.parentPid })
    },
    ...(options.authToken === undefined ? {} : { authToken: options.authToken }),
    activeSockets: new Set(),
    logger: app.log,
    deviceService,
    sessionService,
    metricService,
    capabilityService,
    toolStatusService,
    diagnosticService,
    exportService
  };

  registerLocalCorsMiddleware(app);
  registerLocalAuthMiddleware(app, options.packaged === true ? options.authToken : undefined);

  app.setErrorHandler((error, _request, reply) => {
    const apiError = errorToApiError(error);
    if (apiError.statusCode >= 500) {
      diagnosticService.create({
        level: "error",
        category: "api",
        message: apiError.message,
        details: {
          code: apiError.code
        }
      });
    }
    sendError(reply, error);
  });

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, new AppError("INVALID_REQUEST", "Route not found.", 404));
  });

  await registerHealthRoutes(app, context);
  await registerDeviceRoutes(app, context);
  await registerCapabilityRoutes(app, context);
  await registerSessionRoutes(app, context);
  await registerExportRoutes(app, context);
  await registerToolRoutes(app, context);
  await registerDiagnosticRoutes(app, context);
  await registerAndroidRoutes(app, context);
  await registerPcRoutes(app, context);
  await registerPackagedRoutes(app, context);
  await registerSessionStreamRoutes(app, context);

  app.addHook("onClose", async () => {
    await runtimeManager.stopAll();
    for (const socket of context.activeSockets) {
      try {
        socket.close(1001, "server closing");
      } catch {
        // Ignore close failures during shutdown.
      }
    }
    context.activeSockets.clear();
    database.close();
  });

  return app;
}
