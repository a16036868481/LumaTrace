import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { createServer } from "../apps/local-server/dist/src/server.js";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface DeviceLike {
  id: string;
}

interface TargetLike {
  id: string;
}

interface SessionLike {
  id: string;
  status: string;
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function apiJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const parsed = JSON.parse(text) as ApiSuccess<T>;
  assertCondition(parsed.ok, `Expected ok response from ${path}`);
  return parsed.data;
}

async function waitForMetric(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for UI smoke metric.")), 5000);
    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String((event as { data: unknown }).data)) as { type?: string };
      if (payload.type === "metric") {
        clearTimeout(timeout);
        resolve();
      }
    });
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket failed in UI smoke."));
      },
      { once: true }
    );
  });
}

async function main(): Promise<void> {
  assertCondition(existsSync(resolve("apps/desktop/dist/index.html")), "desktop build output missing.");
  assertCondition(typeof globalThis.WebSocket === "function", "Node WebSocket support is required.");

  const app = await createServer({
    dbPath: ":memory:",
    enableLogger: false,
    metricBatchSize: 4,
    metricFlushIntervalMs: 20
  });

  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const wsBaseUrl = `ws://127.0.0.1:${address.port}`;

    console.log("- desktop build");
    console.log("- health");
    await apiJson(baseUrl, "/api/health");

    console.log("- devices");
    const devices = await apiJson<DeviceLike[]>(baseUrl, "/api/devices");
    assertCondition(devices[0] !== undefined, "No devices returned.");

    console.log("- targets");
    const targets = await apiJson<TargetLike[]>(baseUrl, `/api/devices/${devices[0].id}/targets`);
    assertCondition(targets[0] !== undefined, "No targets returned.");

    console.log("- create session");
    const session = await apiJson<SessionLike>(baseUrl, "/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "MVP-B UI Smoke",
        deviceId: devices[0].id,
        targetId: targets[0].id,
        sampleIntervalMs: 1,
        config: { profileName: "janky_game" }
      })
    });

    console.log("- start session");
    await apiJson(baseUrl, `/api/sessions/${session.id}/start`, { method: "POST" });

    console.log("- websocket metrics");
    const socket = new WebSocket(`${wsBaseUrl}/api/sessions/${session.id}/stream`);
    await waitForMetric(socket);
    socket.close();

    console.log("- stop session");
    await apiJson(baseUrl, `/api/sessions/${session.id}/stop`, { method: "POST" });

    console.log("- report");
    await apiJson(baseUrl, `/api/sessions/${session.id}/report`);

    console.log("- exports");
    for (const format of ["json", "csv", "html"]) {
      const response = await fetch(`${baseUrl}/api/sessions/${session.id}/export?format=${format}`);
      assertCondition(response.ok, `${format} export failed.`);
      await response.text();
    }

    console.log("MVP-B UI smoke test passed");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
