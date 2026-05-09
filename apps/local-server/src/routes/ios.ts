import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { ok, requireStringParam } from "../utils/apiResponse";
import type { IosTraceImportInput, IosXctraceCaptureInput } from "../services/SessionService";

function parseBody<T>(body: unknown): T {
  if (typeof body !== "object" || body === null) {
    return {} as T;
  }
  return body as T;
}

export async function registerIosRoutes(app: FastifyInstance, context: LocalServerContext): Promise<void> {
  app.post<{ Params: { id?: string }; Body: IosTraceImportInput }>(
    "/api/sessions/:id/ios/trace-import",
    async (request) => {
      const sessionId = requireStringParam(request.params.id, "session id");
      return ok(await context.sessionService.importIosTraceCsv(sessionId, parseBody<IosTraceImportInput>(request.body)));
    }
  );

  app.post<{ Params: { id?: string }; Body: IosXctraceCaptureInput }>(
    "/api/sessions/:id/ios/xctrace-capture",
    async (request) => {
      const sessionId = requireStringParam(request.params.id, "session id");
      return ok(await context.sessionService.captureIosXctrace(sessionId, parseBody<IosXctraceCaptureInput>(request.body)));
    }
  );
}
