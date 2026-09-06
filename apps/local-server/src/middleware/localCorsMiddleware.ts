import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const allowedLocalOrigins = [
  /^http:\/\/tauri\.localhost(?::\d+)?$/iu,
  /^https:\/\/tauri\.localhost(?::\d+)?$/iu,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/iu,
  /^http:\/\/localhost(?::\d+)?$/iu
];

function getRequestOrigin(request: FastifyRequest): string | undefined {
  const origin = request.headers.origin;
  if (Array.isArray(origin)) {
    return origin[0];
  }
  return origin;
}

function isAllowedLocalOrigin(origin: string | undefined): origin is string {
  return origin !== undefined && allowedLocalOrigins.some((pattern) => pattern.test(origin));
}

function applyCorsHeaders(reply: FastifyReply, origin: string): void {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Sec-WebSocket-Protocol");
  reply.header("Access-Control-Max-Age", "600");
}

export function registerLocalCorsMiddleware(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const origin = getRequestOrigin(request);
    if (isAllowedLocalOrigin(origin)) {
      applyCorsHeaders(reply, origin);
    }

    if (request.method === "OPTIONS" && request.url.startsWith("/api/")) {
      reply.code(isAllowedLocalOrigin(origin) ? 204 : 403).send();
    }
  });
}
