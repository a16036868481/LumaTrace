import type { ApiErrorPayload } from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload, status?: number) {
    super(payload.message);
    this.name = "ApiError";
    this.code = payload.code;
    if (status !== undefined) {
      this.status = status;
    }
    if (payload.details !== undefined) {
      this.details = payload.details;
    }
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function normalizeApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError({
      code: "CLIENT_ERROR",
      message: error.message
    });
  }

  return new ApiError({
    code: "CLIENT_ERROR",
    message: "Unexpected client error."
  });
}
