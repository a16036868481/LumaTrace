import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { requireStringParam } from "../utils/apiResponse";

export async function registerExportRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get<{ Params: { id?: string }; Querystring: { format?: string } }>(
    "/api/sessions/:id/export",
    async (request, reply) => {
      const sessionId = requireStringParam(request.params.id, "session id");
      const result = context.exportService.exportSession(sessionId, request.query.format);
      reply.type(result.contentType).send(result.body);
    }
  );
}
