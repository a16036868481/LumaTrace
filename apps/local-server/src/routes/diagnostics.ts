import type { FastifyInstance, FastifyReply } from "fastify";
import type { DiagnosticRecord } from "@lumatrace/storage";
import type { LocalServerContext } from "../types";
import { ok } from "../utils/apiResponse";
import { AppError } from "../utils/errors";

interface DiagnosticsQuery {
  sessionId?: string;
  deviceId?: string;
  level?: DiagnosticRecord["level"];
  limit?: string;
  fromTimestampMs?: string;
  toTimestampMs?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function syncCollectorDiagnostics(context: LocalServerContext, sessionId: string): void {
  for (const event of context.deviceService.listAndroidDiagnostics({ sessionId })) {
    context.diagnosticService.createFromAndroidEvent(event);
  }
  for (const event of context.deviceService.listPcDiagnostics({ sessionId })) {
    context.diagnosticService.createFromPcEvent(event);
  }
}

function diagnosticsHtml(sessionId: string, records: readonly DiagnosticRecord[]): string {
  const rows = records
    .map(
      (record) => `<tr>
        <td>${escapeHtml(new Date(record.timestampMs).toISOString())}</td>
        <td>${escapeHtml(record.level)}</td>
        <td>${escapeHtml(record.category)}</td>
        <td>${escapeHtml(record.message)}</td>
        <td>${escapeHtml(JSON.stringify(record.details ?? {}))}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>LumaTrace Android Diagnostics</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2933; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d9e2ec; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #edf2f7; }
  </style>
</head>
<body>
  <h1>LumaTrace Android Diagnostics</h1>
  <p>Session ${escapeHtml(sessionId)}. This export is sanitized and does not include logcat, bugreport output, raw PresentMon CSV, or full local paths.</p>
  <table>
    <thead><tr><th>Timestamp</th><th>Level</th><th>Category</th><th>Message</th><th>Details</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">N/A</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

function sendDiagnosticsExport(
  reply: FastifyReply,
  sessionId: string,
  format: string | undefined,
  records: readonly DiagnosticRecord[]
): void {
  if (format === "json" || format === undefined) {
    reply.type("application/json; charset=utf-8").send(JSON.stringify({ sessionId, diagnostics: records }, null, 2));
    return;
  }
  if (format === "html") {
    reply.type("text/html; charset=utf-8").send(diagnosticsHtml(sessionId, records));
    return;
  }
  throw new AppError("EXPORT_FORMAT_UNSUPPORTED", "Diagnostics export format is unsupported.", 400, { format });
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("INVALID_REQUEST", "Expected numeric query parameter.", 400, { value });
  }
  return parsed;
}

export async function registerDiagnosticRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get<{ Querystring: DiagnosticsQuery }>("/api/diagnostics", async (request) => {
    const options: {
      sessionId?: string;
      deviceId?: string;
      level?: DiagnosticRecord["level"];
      limit?: number;
      fromTimestampMs?: number;
      toTimestampMs?: number;
    } = {};
    const limit = parseNumber(request.query.limit);
    const fromTimestampMs = parseNumber(request.query.fromTimestampMs);
    const toTimestampMs = parseNumber(request.query.toTimestampMs);

    if (request.query.sessionId !== undefined) {
      options.sessionId = request.query.sessionId;
    }
    if (request.query.deviceId !== undefined) {
      options.deviceId = request.query.deviceId;
    }
    if (request.query.level !== undefined) {
      options.level = request.query.level;
    }
    if (limit !== undefined) {
      options.limit = limit;
    }
    if (fromTimestampMs !== undefined) {
      options.fromTimestampMs = fromTimestampMs;
    }
    if (toTimestampMs !== undefined) {
      options.toTimestampMs = toTimestampMs;
    }

    return ok(context.diagnosticService.list(options));
  });

  app.get<{ Params: { id?: string } }>("/api/sessions/:id/diagnostics", async (request) => {
    const sessionId = request.params.id;
    if (sessionId === undefined || sessionId.length === 0) {
      throw new AppError("INVALID_REQUEST", "session id is required.", 400);
    }
    context.sessionService.getSession(sessionId);
    syncCollectorDiagnostics(context, sessionId);
    return ok(context.diagnosticService.list({ sessionId, limit: 1000 }));
  });

  app.get<{
    Params: { id?: string };
    Querystring: { format?: string };
  }>("/api/sessions/:id/diagnostics/export", async (request, reply) => {
    const sessionId = request.params.id;
    if (sessionId === undefined || sessionId.length === 0) {
      throw new AppError("INVALID_REQUEST", "session id is required.", 400);
    }
    context.sessionService.getSession(sessionId);
    syncCollectorDiagnostics(context, sessionId);
    sendDiagnosticsExport(
      reply,
      sessionId,
      request.query.format,
      context.diagnosticService.list({ sessionId, limit: 1000 })
    );
  });
}
