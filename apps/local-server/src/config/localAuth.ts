import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { AppError } from "../utils/errors";

const WS_PROTOCOL_PREFIX = "lumatrace-auth.";

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getBearerTokenFromRequest(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (authorization !== undefined) {
    const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(authorization) ? authorization[0] ?? "" : authorization);
    if (match?.[1] !== undefined && match[1].length > 0) {
      return match[1];
    }
  }

  const protocol = request.headers["sec-websocket-protocol"];
  const protocols = (Array.isArray(protocol) ? protocol.join(",") : protocol ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const authProtocol = protocols.find((item) => item.startsWith(WS_PROTOCOL_PREFIX));
  return authProtocol === undefined ? null : authProtocol.slice(WS_PROTOCOL_PREFIX.length);
}

export function assertLocalAuth(request: FastifyRequest, expectedToken: string): void {
  const token = getBearerTokenFromRequest(request);
  if (token === null) {
    throw new AppError("AUTH_REQUIRED", "Local auth token is required.", 401);
  }
  if (!safeCompare(token, expectedToken)) {
    throw new AppError("AUTH_INVALID", "Local auth token is invalid.", 401);
  }
}

export function buildWebSocketAuthProtocol(token: string): string {
  return `${WS_PROTOCOL_PREFIX}${token}`;
}
