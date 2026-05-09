import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { ok, requireStringParam } from "../utils/apiResponse";

export async function registerDeviceRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get("/api/devices", async () => ok(await context.deviceService.discoverDevices()));

  app.get<{ Params: { id?: string } }>("/api/devices/:id/targets", async (request) => {
    const deviceId = requireStringParam(request.params.id, "device id");
    return ok(await context.deviceService.listTargets(deviceId));
  });
}
