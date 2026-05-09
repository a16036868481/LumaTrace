import { ApiError } from "./errors";
import type { MetricEvent, Session, SessionStreamMessage } from "./types";
import { getCachedLocalAuthToken } from "../tauri/localAuth";
import { getCachedLocalServerInfo } from "../tauri/tauriClient";

export interface SessionWebSocketHandlers {
  onMetric?: (event: MetricEvent) => void;
  onStatus?: (status: Session["status"], sessionId: string) => void;
  onStopped?: (sessionId: string) => void;
  onApiError?: (error: ApiError) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface SessionWebSocketOptions {
  wsBaseUrl?: string;
  reconnect?: boolean;
  authToken?: string;
  webSocketFactory?: (url: string, protocols?: string | string[]) => WebSocket;
}

export interface SessionWebSocketHandle {
  close: () => void;
  socket: WebSocket;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getDefaultWsBaseUrl(): string {
  return trimTrailingSlash(
    getCachedLocalServerInfo()?.wsBaseUrl ?? import.meta.env.VITE_WS_BASE_URL ?? "ws://127.0.0.1:3100"
  );
}

function buildWsUrl(sessionId: string, baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/api/sessions/${encodeURIComponent(sessionId)}/stream`;
}

function handleMessage(payload: unknown, handlers: SessionWebSocketHandlers): void {
  const message = payload as SessionStreamMessage;
  if (message.type === "metric") {
    handlers.onMetric?.(message.data);
    return;
  }
  if (message.type === "session_status") {
    handlers.onStatus?.(message.data.status, message.data.sessionId);
    return;
  }
  if (message.type === "session_stopped") {
    handlers.onStopped?.(message.data.sessionId);
    return;
  }
  if (message.type === "error") {
    handlers.onApiError?.(new ApiError(message.error));
    return;
  }

  handlers.onError?.(new Error("Unknown WebSocket message."));
}

export function createSessionWebSocket(
  sessionId: string,
  handlers: SessionWebSocketHandlers,
  options: SessionWebSocketOptions = {}
): SessionWebSocketHandle {
  const token = options.authToken ?? getCachedLocalAuthToken();
  const protocols = token === null || token === undefined ? undefined : ["lumatrace", `lumatrace-auth.${token}`];
  const socket = (options.webSocketFactory ?? ((url: string, nextProtocols?: string | string[]) => new WebSocket(url, nextProtocols)))(
    buildWsUrl(sessionId, options.wsBaseUrl ?? getDefaultWsBaseUrl()),
    protocols
  );
  let closedByClient = false;

  socket.addEventListener("message", (event) => {
    try {
      handleMessage(JSON.parse(String(event.data)), handlers);
    } catch {
      handlers.onError?.(new Error("Failed to parse WebSocket message."));
    }
  });

  socket.addEventListener("error", () => {
    handlers.onError?.(new Error("WebSocket connection error."));
  });

  socket.addEventListener("close", () => {
    handlers.onClose?.();
    if (options.reconnect === true && !closedByClient) {
      handlers.onError?.(new Error("Reconnect is not implemented in this MVP-B batch."));
    }
  });

  return {
    socket,
    close: () => {
      closedByClient = true;
      socket.close();
    }
  };
}
