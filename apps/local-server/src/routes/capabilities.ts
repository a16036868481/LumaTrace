import type { FastifyInstance } from "fastify";
import type { Platform } from "@lumatrace/core";
import type { LocalServerContext } from "../types";
import { ok } from "../utils/apiResponse";
import { AppError } from "../utils/errors";

const PLATFORMS: readonly Platform[] = ["android", "ios", "windows", "macos", "linux"];

function parsePlatform(value: unknown): Platform | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !PLATFORMS.includes(value as Platform)) {
    throw new AppError("INVALID_REQUEST", "Invalid platform.", 400, { platform: value });
  }
  return value as Platform;
}

export async function registerCapabilityRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get<{ Querystring: { platform?: string } }>("/api/capabilities", async (request) =>
    ok(await context.capabilityService.list(parsePlatform(request.query.platform)))
  );
}
