import type { FastifyInstance } from "fastify";
import type { LocalServerContext } from "../types";
import { ok, requireStringParam } from "../utils/apiResponse";
import { AppError } from "../utils/errors";
import type { CreateSessionInput, MarkerInput } from "../services/SessionService";
import type { DownsampledMetricQueryInput, MetricQueryInput } from "../services/MetricService";

interface MetricsQuery {
  fromTimestampMs?: string;
  toTimestampMs?: string;
  metricNames?: string;
  limit?: string;
  offset?: string;
  bucketSizeMs?: string;
}

interface SessionsQuery {
  limit?: string;
}

function parseNumber(value: string | undefined, key: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("INVALID_REQUEST", `${key} must be a number.`, 400, { [key]: value });
  }
  return parsed;
}

function parseMetricsQuery(query: MetricsQuery): MetricQueryInput {
  const metricNames = query.metricNames
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const input: MetricQueryInput = {};
  const limit = parseNumber(query.limit, "limit");
  const offset = parseNumber(query.offset, "offset");
  const fromTimestampMs = parseNumber(query.fromTimestampMs, "fromTimestampMs");
  const toTimestampMs = parseNumber(query.toTimestampMs, "toTimestampMs");
  if (limit !== undefined) {
    input.limit = limit;
  }
  if (offset !== undefined) {
    input.offset = offset;
  }
  if (fromTimestampMs !== undefined) {
    input.fromTimestampMs = fromTimestampMs;
  }
  if (toTimestampMs !== undefined) {
    input.toTimestampMs = toTimestampMs;
  }
  if (metricNames !== undefined && metricNames.length > 0) {
    input.metricNames = metricNames;
  }

  return input;
}

function parseDownsampledMetricsQuery(query: MetricsQuery): DownsampledMetricQueryInput {
  const base = parseMetricsQuery(query);
  const bucketSizeMs = parseNumber(query.bucketSizeMs, "bucketSizeMs") ?? 1000;
  if (!Number.isInteger(bucketSizeMs) || bucketSizeMs <= 0) {
    throw new AppError("INVALID_REQUEST", "bucketSizeMs must be a positive integer.", 400, {
      bucketSizeMs
    });
  }
  if (bucketSizeMs > 3_600_000) {
    throw new AppError("INVALID_REQUEST", "bucketSizeMs must be less than or equal to 3600000.", 400, {
      bucketSizeMs
    });
  }
  return {
    ...base,
    bucketSizeMs
  };
}

function parseBody<T>(body: unknown): T {
  if (typeof body !== "object" || body === null) {
    throw new AppError("INVALID_REQUEST", "Request body must be an object.", 400);
  }
  return body as T;
}

export async function registerSessionRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get<{ Querystring: SessionsQuery }>("/api/sessions", async (request) => {
    const limit = parseNumber(request.query.limit, "limit");
    return ok(context.sessionService.listSessions(limit));
  });

  app.get<{ Params: { id?: string } }>("/api/sessions/:id", async (request) => {
    const sessionId = requireStringParam(request.params.id, "session id");
    return ok(context.sessionService.getSession(sessionId));
  });

  app.post<{ Body: CreateSessionInput }>("/api/sessions", async (request) =>
    ok(await context.sessionService.createSession(parseBody<CreateSessionInput>(request.body)))
  );

  app.post<{ Params: { id?: string } }>("/api/sessions/:id/start", async (request) => {
    const sessionId = requireStringParam(request.params.id, "session id");
    return ok(await context.sessionService.startSession(sessionId));
  });

  app.post<{ Params: { id?: string } }>("/api/sessions/:id/pause", async (request) => {
    const sessionId = requireStringParam(request.params.id, "session id");
    return ok(await context.sessionService.pauseSession(sessionId));
  });

  app.post<{ Params: { id?: string } }>("/api/sessions/:id/stop", async (request) => {
    const sessionId = requireStringParam(request.params.id, "session id");
    return ok(await context.sessionService.stopSession(sessionId));
  });

  app.get<{ Params: { id?: string }; Querystring: MetricsQuery }>(
    "/api/sessions/:id/metrics/downsampled",
    async (request) => {
      const sessionId = requireStringParam(request.params.id, "session id");
      context.sessionService.getSession(sessionId);
      return ok(
        context.metricService.queryDownsampledMetrics(
          sessionId,
          parseDownsampledMetricsQuery(request.query)
        )
      );
    }
  );

  app.get<{ Params: { id?: string }; Querystring: MetricsQuery }>(
    "/api/sessions/:id/metrics",
    async (request) => {
      const sessionId = requireStringParam(request.params.id, "session id");
      context.sessionService.getSession(sessionId);
      return ok(context.metricService.queryMetrics(sessionId, parseMetricsQuery(request.query)));
    }
  );

  app.post<{ Params: { id?: string }; Body: MarkerInput }>(
    "/api/sessions/:id/markers",
    async (request) => {
      const sessionId = requireStringParam(request.params.id, "session id");
      return ok(context.sessionService.addMarker(sessionId, parseBody<MarkerInput>(request.body)));
    }
  );

  app.get<{ Params: { id?: string } }>("/api/sessions/:id/markers", async (request) => {
    const sessionId = requireStringParam(request.params.id, "session id");
    return ok(context.sessionService.listMarkers(sessionId));
  });

  app.get<{ Params: { id?: string } }>("/api/sessions/:id/report", async (request) => {
    const sessionId = requireStringParam(request.params.id, "session id");
    return ok(context.sessionService.getReport(sessionId));
  });
}
