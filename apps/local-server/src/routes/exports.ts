import type { FastifyInstance } from "fastify";
import type { ReportLocalization } from "@lumatrace/report";
import type { LocalServerContext } from "../types";
import { requireStringParam } from "../utils/apiResponse";
import { AppError } from "../utils/errors";

interface ExportBody {
  format?: string;
  localization?: ReportLocalization;
}

function parseBody<T>(body: unknown): T {
  if (typeof body !== "object" || body === null) {
    throw new AppError("INVALID_REQUEST", "Request body must be an object.", 400);
  }
  return body as T;
}

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

  app.post<{ Params: { id?: string }; Body: ExportBody }>(
    "/api/sessions/:id/export",
    async (request, reply) => {
      const sessionId = requireStringParam(request.params.id, "session id");
      const body = parseBody<ExportBody>(request.body);
      const result = context.exportService.exportSession(sessionId, body.format, body.localization);
      reply.type(result.contentType).send(result.body);
    }
  );
}
