import type { FastifyInstance } from "fastify";
import type { AndroidAppStartOptions, AndroidAppStopOptions } from "@lumatrace/collectors-android";
import type { LocalServerContext } from "../types";
import { ok, requireStringParam } from "../utils/apiResponse";

export async function registerAndroidRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.post<{
    Params: { deviceId?: string; packageName?: string };
    Body: AndroidAppStartOptions;
  }>("/api/android/:deviceId/apps/:packageName/start", async (request) => {
    const deviceId = requireStringParam(request.params.deviceId, "device id");
    const packageName = requireStringParam(request.params.packageName, "packageName");
    return ok(await context.deviceService.startAndroidApp(deviceId, packageName, request.body ?? {}));
  });

  app.post<{
    Params: { deviceId?: string; packageName?: string };
    Body: AndroidAppStopOptions;
  }>("/api/android/:deviceId/apps/:packageName/stop", async (request) => {
    const deviceId = requireStringParam(request.params.deviceId, "device id");
    const packageName = requireStringParam(request.params.packageName, "packageName");
    return ok(await context.deviceService.stopAndroidApp(deviceId, packageName, request.body ?? {}));
  });

  app.get<{ Params: { deviceId?: string } }>("/api/android/:deviceId/health", async (request) => {
    const deviceId = requireStringParam(request.params.deviceId, "device id");
    return ok(await context.deviceService.getAndroidHealth(deviceId));
  });

  app.get<{ Params: { deviceId?: string } }>("/api/android/:deviceId/foreground-app", async (request) => {
    const deviceId = requireStringParam(request.params.deviceId, "device id");
    return ok(await context.deviceService.getAndroidForegroundTarget(deviceId));
  });

  app.get<{ Params: { deviceId?: string } }>("/api/android/:deviceId/cache/status", async (request) => {
    const deviceId = requireStringParam(request.params.deviceId, "device id");
    return ok(await context.deviceService.getAndroidCacheStatus(deviceId));
  });

  app.post<{ Params: { deviceId?: string } }>("/api/android/:deviceId/cache/refresh", async (request) => {
    const deviceId = requireStringParam(request.params.deviceId, "device id");
    return ok(await context.deviceService.refreshAndroidCache(deviceId));
  });
}
