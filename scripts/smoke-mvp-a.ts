import type { AddressInfo } from "node:net";
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

interface MetricLike {
  source?: string;
  precision?: string;
  confidence?: string;
}

interface ReportLike {
  summary: {
    durationMs: number;
  };
  rawMetricCount: number;
}

interface WebSocketEnvelope {
  type?: string;
  data?: MetricLike;
}

const TIMEOUT_MS = 5000;

function step(message: string): void {
  console.log(`- ${message}`);
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

async function apiJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const parsed = await readJson<ApiSuccess<T>>(response);
  assertCondition(parsed.ok === true, `Expected ok response from ${path}`);
  return parsed.data;
}

async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out opening WebSocket."));
    }, TIMEOUT_MS);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket failed to open."));
      },
      { once: true }
    );
  });
}

async function collectMetricMessages(socket: WebSocket, count: number): Promise<MetricLike[]> {
  const metrics: MetricLike[] = [];

  return new Promise<MetricLike[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${count} metric messages.`));
    }, TIMEOUT_MS);

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String((event as { data: unknown }).data)) as WebSocketEnvelope;
      if (payload.type === "metric" && payload.data !== undefined) {
        metrics.push(payload.data);
        if (metrics.length >= count) {
          clearTimeout(timeout);
          resolve(metrics);
        }
      }
    });
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket error while waiting for metrics."));
      },
      { once: true }
    );
  });
}

async function main(): Promise<void> {
  assertCondition(
    typeof globalThis.WebSocket === "function",
    "This smoke script requires a Node.js runtime with global WebSocket support."
  );

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

    step("health");
    const health = await apiJson<{ status: string; version: string }>(baseUrl, "/api/health");
    assertCondition(health.status === "ok", "Health status was not ok.");
    assertCondition(health.version === "mvp-a", "Health version was not mvp-a.");

    step("devices");
    const devices = await apiJson<DeviceLike[]>(baseUrl, "/api/devices");
    assertCondition(devices[0]?.id === "mock-local-device-1", "Mock device missing.");

    step("targets");
    const targets = await apiJson<TargetLike[]>(
      baseUrl,
      `/api/devices/${devices[0].id}/targets`
    );
    assertCondition(targets.length > 0, "Mock targets missing.");

    step("create session");
    const session = await apiJson<SessionLike>(baseUrl, "/api/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "MVP-A Smoke Session",
        deviceId: devices[0].id,
        targetId: targets[0]?.id,
        sampleIntervalMs: 1,
        config: {
          profileName: "janky_game"
        }
      })
    });
    assertCondition(session.status === "created", "Session was not created.");

    step("start session");
    const running = await apiJson<SessionLike>(baseUrl, `/api/sessions/${session.id}/start`, {
      method: "POST"
    });
    assertCondition(running.status === "running", "Session was not running.");

    step("websocket metrics");
    const socket = new globalThis.WebSocket(`${wsBaseUrl}/api/sessions/${session.id}/stream`);
    await waitForSocketOpen(socket);
    const websocketMetrics = await collectMetricMessages(socket, 4);
    socket.close();
    for (const metric of websocketMetrics) {
      assertCondition(metric.source === "mock", "WebSocket metric source was not mock.");
      assertCondition(metric.precision !== undefined, "WebSocket metric precision missing.");
      assertCondition(metric.confidence !== undefined, "WebSocket metric confidence missing.");
    }

    step("marker");
    await apiJson(baseUrl, `/api/sessions/${session.id}/markers`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        label: "Smoke marker",
        description: "Created by scripts/smoke-mvp-a.ts"
      })
    });

    step("metrics query");
    const storedMetrics = await apiJson<MetricLike[]>(
      baseUrl,
      `/api/sessions/${session.id}/metrics?limit=100`
    );
    assertCondition(storedMetrics.length > 0, "No stored metrics returned.");
    assertCondition(
      storedMetrics.every((metric) => metric.source === "mock"),
      "Stored metric source was not mock."
    );

    step("stop session");
    const stopped = await apiJson<SessionLike>(baseUrl, `/api/sessions/${session.id}/stop`, {
      method: "POST"
    });
    assertCondition(stopped.status === "stopped", "Session was not stopped.");

    step("report");
    const report = await apiJson<ReportLike>(baseUrl, `/api/sessions/${session.id}/report`);
    assertCondition(report.rawMetricCount > 0, "Report rawMetricCount was empty.");
    assertCondition(report.summary.durationMs >= 0, "Report duration was invalid.");

    step("export json");
    const jsonExport = await fetch(`${baseUrl}/api/sessions/${session.id}/export?format=json`);
    assertCondition(jsonExport.ok, "JSON export failed.");
    JSON.parse(await jsonExport.text());

    step("export csv");
    const csvExport = await fetch(`${baseUrl}/api/sessions/${session.id}/export?format=csv`);
    assertCondition(csvExport.ok, "CSV export failed.");
    assertCondition((await csvExport.text()).includes("timestampMs"), "CSV export missing header.");

    step("export html");
    const htmlExport = await fetch(`${baseUrl}/api/sessions/${session.id}/export?format=html`);
    assertCondition(htmlExport.ok, "HTML export failed.");
    assertCondition(
      (await htmlExport.text()).includes("<!doctype html>"),
      "HTML export missing doctype."
    );

    console.log("MVP-A smoke test passed");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
