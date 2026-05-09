import { CollectorError } from "@lumatrace/core";

export interface ApiErrorShape {
  code: string;
  message: string;
  statusCode: number;
  details: Record<string, unknown>;
}

const STATUS_BY_CODE: Record<string, number> = {
  DEVICE_NOT_FOUND: 404,
  TARGET_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  SESSION_ALREADY_RUNNING: 409,
  SESSION_NOT_RUNNING: 409,
  INVALID_REQUEST: 400,
  EXPORT_FORMAT_UNSUPPORTED: 400,
  COLLECTOR_NOT_IMPLEMENTED: 501,
  DEVICE_NOT_READY: 409,
  TARGET_PROCESS_NOT_RUNNING: 409,
  TOOL_UNAVAILABLE: 503,
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  INTERNAL_ERROR: 500
};

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = STATUS_BY_CODE[code] ?? 500,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorToApiError(error: unknown): ApiErrorShape {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details
    };
  }

  if (error instanceof CollectorError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: STATUS_BY_CODE[error.code] ?? 500,
      details: { ...error.context }
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message || "Internal server error.",
      statusCode: 500,
      details: {}
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Internal server error.",
    statusCode: 500,
    details: {}
  };
}
