import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { ok } from "../utils/apiResponse";

export async function registerToolRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get("/api/tools/status", async () => ok(context.toolStatusService.listToolStatus()));
}
