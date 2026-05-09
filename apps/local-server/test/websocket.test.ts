import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { LumaTraceDatabase } from "@lumatrace/storage";
import { createServer } from "../src/server";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

function parsePayload<T>(payload: string): ApiSuccess<T> {
  return JSON.parse(payload) as ApiSuccess<T>;
}

function waitForMessage(socket: WebSocket, predicate: (message: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for websocket message."));
    }, 1000);
    const onMessage = (data: WebSocket.RawData): void => {
      const parsed = JSON.parse(data.toString()) as unknown;
      if (predicate(parsed)) {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        resolve(parsed);
      }
    };
    socket.on("message", onMessage);
  });
}

async function createRunningSession(app: Awaited<ReturnType<typeof createServer>>): Promise<string> {
  const devices = parsePayload<Array<{ id: string }>>(
    (await app.inject({ method: "GET", url: "/api/devices" })).payload
  ).data;
  const targets = parsePayload<Array<{ id: string }>>(
    (
      await app.inject({
        method: "GET",
        url: `/api/devices/${devices[0]?.id}/targets`
      })
    ).payload
  ).data;
  const session = parsePayload<{ id: string }>(
    (
      await app.inject({
        method: "POST",
        url: "/api/sessions",
        payload: {
          name: "WebSocket Session",
          deviceId: devices[0]?.id,
          targetId: targets[0]?.id,
          sampleIntervalMs: 1
        }
      })
    ).payload
  ).data;
  await app.inject({ method: "POST", url: `/api/sessions/${session.id}/start` });
  return session.id;
}

describe("local-server websocket stream", () => {
  it("streams metrics, supports multiple clients, survives disconnect, and reports stop", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const app = await createServer({
      database,
      enableLogger: false,
      metricBatchSize: 4,
      metricFlushIntervalMs: 20
    });

    try {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address() as AddressInfo;
      const sessionId = await createRunningSession(app);
      const url = `ws://127.0.0.1:${address.port}/api/sessions/${sessionId}/stream`;
      const first = new WebSocket(url);
      const second = new WebSocket(url);

      await Promise.all([
        waitForMessage(first, (message) => (message as { type?: string }).type === "metric"),
        waitForMessage(second, (message) => (message as { type?: string }).type === "metric")
      ]);

      first.close();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const metricsAfterDisconnect = parsePayload<unknown[]>(
        (await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/metrics` })).payload
      ).data.length;
      expect(metricsAfterDisconnect).toBeGreaterThan(0);

      const stoppedPromise = waitForMessage(
        second,
        (message) => (message as { type?: string }).type === "session_stopped"
      );
      await app.inject({ method: "POST", url: `/api/sessions/${sessionId}/stop` });
      await stoppedPromise;
      second.close();

      const missing = new WebSocket(
        `ws://127.0.0.1:${address.port}/api/sessions/missing/stream`
      );
      const errorMessage = await waitForMessage(
        missing,
        (message) => (message as { type?: string }).type === "error"
      );
      expect(errorMessage).toMatchObject({
        type: "error",
        error: {
          code: "SESSION_NOT_FOUND"
        }
      });
      missing.close();
    } finally {
      await app.close();
    }
  });
});
