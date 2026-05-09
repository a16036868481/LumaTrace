import type { FastifyInstance } from "fastify";
import { assertLocalAuth } from "../config/localAuth";

export function registerLocalAuthMiddleware(app: FastifyInstance, token: string | undefined): void {
  if (token === undefined) {
    return;
  }
  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }
    if (request.url.startsWith("/api/health")) {
      return;
    }
    if (/^\/api\/sessions\/[^/]+\/stream(?:\?|$)/.test(request.url)) {
      return;
    }
    assertLocalAuth(request, token);
  });
}
