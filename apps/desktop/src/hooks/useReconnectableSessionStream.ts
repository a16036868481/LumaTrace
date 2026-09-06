import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "../api/errors";
import type { MetricEvent, Session } from "../api/types";
import { createSessionWebSocket, type SessionWebSocketOptions } from "../api/websocket";

export type ReconnectableStreamStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error"
  | "stopped";

export interface ReconnectableSessionStreamOptions extends SessionWebSocketOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface ReconnectableSessionStreamState {
  metrics: MetricEvent[];
  connectionStatus: ReconnectableStreamStatus;
  sessionStatus: Session["status"] | "idle";
  retryCount: number;
  error: ApiError | Error | null;
  stopReconnect: () => void;
  clearMetrics: () => void;
}

export function useReconnectableSessionStream(
  sessionId: string | null,
  enabled: boolean,
  options: ReconnectableSessionStreamOptions = {}
): ReconnectableSessionStreamState {
  const [metrics, setMetrics] = useState<MetricEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ReconnectableStreamStatus>("idle");
  const [sessionStatus, setSessionStatus] = useState<Session["status"] | "idle">("idle");
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const retryRef = useRef(0);
  const connectRef = useRef<() => void>(() => undefined);
  const maxRetries = options.maxRetries ?? 5;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const wsBaseUrl = options.wsBaseUrl;
  const webSocketFactory = options.webSocketFactory;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopReconnect = useCallback(() => {
    stoppedRef.current = true;
    clearTimer();
    socketRef.current?.close();
    setConnectionStatus("closed");
  }, [clearTimer]);

  const scheduleReconnect = useCallback(() => {
    if (stoppedRef.current || retryRef.current >= maxRetries) {
      setConnectionStatus(stoppedRef.current ? "stopped" : "error");
      return;
    }
    retryRef.current += 1;
    setRetryCount(retryRef.current);
    setConnectionStatus("reconnecting");
    const delay = Math.min(initialDelayMs * 2 ** (retryRef.current - 1), maxDelayMs);
    clearTimer();
    timerRef.current = setTimeout(() => connectRef.current(), delay);
  }, [clearTimer, initialDelayMs, maxDelayMs, maxRetries]);

  const connect = useCallback(() => {
    if (sessionId === null || !enabled || stoppedRef.current) {
      return;
    }
    setConnectionStatus(retryRef.current > 0 ? "reconnecting" : "connecting");
    const socketOptions: SessionWebSocketOptions = {};
    if (wsBaseUrl !== undefined) {
      socketOptions.wsBaseUrl = wsBaseUrl;
    }
    if (webSocketFactory !== undefined) {
      socketOptions.webSocketFactory = webSocketFactory;
    }

    const handle = createSessionWebSocket(
      sessionId,
      {
        onMetric: (event) => {
          retryRef.current = 0;
          setRetryCount(0);
          setConnectionStatus("open");
          setMetrics((current) => [...current.slice(-999), event]);
        },
        onStatus: (status) => {
          setSessionStatus(status);
          if (status === "running" && socketRef.current?.readyState === WebSocket.OPEN) {
            setConnectionStatus("open");
          } else if (status === "stopped" || status === "failed") {
            stoppedRef.current = true;
            clearTimer();
            setConnectionStatus(status === "failed" ? "error" : "stopped");
          }
        },
        onStopped: () => {
          stoppedRef.current = true;
          clearTimer();
          setSessionStatus("stopped");
          setConnectionStatus("stopped");
        },
        onApiError: (apiError) => {
          setError(apiError);
          setConnectionStatus("error");
        },
        onError: (caught) => {
          setError(caught);
          if (!stoppedRef.current) {
            setConnectionStatus("error");
          }
        },
        onClose: () => {
          if (stoppedRef.current) {
            setConnectionStatus("stopped");
            return;
          }
          if (socketRef.current?.readyState === WebSocket.CLOSED) {
            scheduleReconnect();
          }
        }
      },
      socketOptions
    );
    socketRef.current = handle.socket;
  }, [clearTimer, enabled, scheduleReconnect, sessionId, webSocketFactory, wsBaseUrl]);

  connectRef.current = connect;

  useEffect(() => {
    stoppedRef.current = false;
    retryRef.current = 0;
    setRetryCount(0);
    setError(null);
    if (!enabled || sessionId === null) {
      setConnectionStatus("idle");
      return undefined;
    }
    connect();
    return () => {
      stoppedRef.current = true;
      clearTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clearTimer, connect, enabled, sessionId]);

  return {
    metrics,
    connectionStatus,
    sessionStatus,
    retryCount,
    error,
    stopReconnect,
    clearMetrics: () => setMetrics([])
  };
}
