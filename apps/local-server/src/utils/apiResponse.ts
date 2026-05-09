import type { FastifyReply } from "fastify";
import { AppError, errorToApiError } from "./errors";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data
  };
}

export function sendError(reply: FastifyReply, error: unknown): void {
  const apiError = errorToApiError(error);
  reply.status(apiError.statusCode).send({
    ok: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      details: apiError.details
    }
  } satisfies ApiFailure);
}

export function requireStringParam(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("INVALID_REQUEST", `${name} is required.`, 400);
  }

  return value;
}
