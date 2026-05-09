import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { ok } from "../utils/apiResponse";

export async function registerHealthRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get("/api/health", async () =>
    ok({
      status: "ok",
      version: context.version,
      uptimeMs: Date.now() - context.startedAt
    })
  );
}
