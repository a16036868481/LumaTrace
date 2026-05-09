import type { FastifyInstance } from "fastify";
import type { MetricEvent } from "@lumatrace/core";
import type { LocalServerContext, WebSocketConnection } from "../types";
import { requireStringParam } from "../utils/apiResponse";
import { assertLocalAuth } from "../config/localAuth";
import { errorToApiError } from "../utils/errors";
import type { SessionStreamMessage } from "../runtime/SessionRuntime";

function sendJson(socket: WebSocketConnection, message: SessionStreamMessage): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

function metricMessage(event: MetricEvent): SessionStreamMessage {
  return {
    type: "metric",
    data: event
  };
}

export async function registerSessionStreamRoutes(
  app: FastifyInstance,
  context: LocalServerContext
): Promise<void> {
  app.get<{ Params: { id?: string } }>(
    "/api/sessions/:id/stream",
    { websocket: true },
    (socket, request) => {
      const ws = socket as WebSocketConnection;
      context.activeSockets.add(ws);

      let unsubscribe: (() => void) | undefined;
      const cleanup = (): void => {
        unsubscribe?.();
        context.activeSockets.delete(ws);
      };

      ws.on("close", cleanup);
      ws.on("error", cleanup);

      try {
        if (context.authToken !== undefined) {
          assertLocalAuth(request, context.authToken);
        }
        const sessionId = requireStringParam(request.params.id, "session id");
        const session = context.sessionService.getSession(sessionId);
        sendJson(ws, {
          type: "session_status",
          data: {
            sessionId,
            status: session.status
          }
        });

        const runtime = context.runtimeManager.getRuntime(sessionId);
        if (runtime !== undefined && runtime.getStatus() === "running") {
          for (const event of context.runtimeManager
            .getRingBuffer()
            .getRecent(sessionId, 100)) {
            sendJson(ws, metricMessage(event));
          }

          unsubscribe = runtime.subscribe({
            send: (message) => sendJson(ws, message),
            close: () => ws.close(1000, "session stopped")
          });
        }
      } catch (error) {
        const apiError = errorToApiError(error);
        sendJson(ws, {
          type: "error",
          error: {
            code: apiError.code,
            message: apiError.message
          }
        });
        ws.close(1008, apiError.code);
      }
    }
  );
}
