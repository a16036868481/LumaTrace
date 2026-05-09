import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { ok, requireStringParam } from "../utils/apiResponse";

export async function registerPcRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get<{ Params: { deviceId?: string } }>("/api/pc/:deviceId/presentmon/status", async (request) => {
    const deviceId = requireStringParam(request.params.deviceId, "device id");
    return ok(await context.deviceService.getPcPresentMonStatus(deviceId));
  });

  app.get<{ Params: { id?: string } }>("/api/sessions/:id/presentmon/status", async (request) => {
    const sessionId = requireStringParam(request.params.id, "session id");
    context.sessionService.getSession(sessionId);
    return ok(context.deviceService.getPcPresentMonCaptureStatus(sessionId));
  });
}
