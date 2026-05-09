import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../apps/local-server/dist/src/server.js";

const token = `packaged-storage-${Date.now()}-token-123456789`;
const tempRoot = mkdtempSync(join(tmpdir(), "lumatrace-packaged-storage-smoke-"));
const dataDir = join(tempRoot, "data");
const dbPath = join(dataDir, "lumatrace.db");
const reportsDir = join(tempRoot, "reports");
const diagnosticsDir = join(tempRoot, "diagnostics");
const logsDir = join(tempRoot, "logs");

mkdirSync(dataDir, { recursive: true });
mkdirSync(reportsDir, { recursive: true });
mkdirSync(diagnosticsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(port: number, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? ((await response.json()) as unknown) : await response.text();
  return { response, body };
}

async function startPackagedServer() {
  const app = await createServer({
    packaged: true,
    host: "127.0.0.1",
    port: 0,
    dbPath,
    reportsDir,
    diagnosticsDir,
    logsDir,
    authToken: token,
    enableAndroidCollector: false,
    enablePcCollector: false,
    enableLogger: false
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(typeof address === "object" && address !== null, "Expected local-server port.");
  return { app, port: address.port };
}

async function waitForMetric(port: number, sessionId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/sessions/${sessionId}/stream`, [
      "lumatrace",
      `lumatrace-auth.${token}`
    ]);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for mock metric over packaged WebSocket."));
    }, 5000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { type?: string };
      if (message.type === "metric") {
        clearTimeout(timer);
        socket.close();
        resolve();
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Packaged storage smoke WebSocket failed."));
    });
  });
}

async function runSession(port: number): Promise<string> {
  const devices = await fetchJson(port, "/api/devices");
  assert(devices.response.status === 200, "GET /api/devices failed.");
  const device = (devices.body as { data?: Array<{ id: string; platform: string; tags?: Record<string, unknown> }> }).data?.find(
    (item) => item.tags?.source === "mock" || item.id.startsWith("mock-")
  );
  assert(device !== undefined, "Mock device not found.");

  const targets = await fetchJson(port, `/api/devices/${encodeURIComponent(device.id)}/targets`);
  assert(targets.response.status === 200, "GET /api/devices/:id/targets failed.");
  const target = (targets.body as { data?: Array<{ id: string }> }).data?.[0];
  assert(target !== undefined, "Mock target not found.");

  const create = await fetchJson(port, "/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Packaged storage smoke",
      deviceId: device.id,
      targetId: target.id,
      sampleIntervalMs: 50
    })
  });
  assert(create.response.status === 200, "POST /api/sessions failed.");
  const sessionId = (create.body as { data?: { id?: string } }).data?.id;
  assert(sessionId !== undefined, "Created session id missing.");

  const start = await fetchJson(port, `/api/sessions/${sessionId}/start`, { method: "POST" });
  assert(start.response.status === 200, "POST /api/sessions/:id/start failed.");
  await waitForMetric(port, sessionId);

  const stop = await fetchJson(port, `/api/sessions/${sessionId}/stop`, { method: "POST" });
  assert(stop.response.status === 200, "POST /api/sessions/:id/stop failed.");

  const report = await fetchJson(port, `/api/sessions/${sessionId}/report`);
  assert(report.response.status === 200, "GET /api/sessions/:id/report failed.");
  for (const format of ["json", "html", "csv"]) {
    const exported = await fetchJson(port, `/api/sessions/${sessionId}/export?format=${format}`);
    assert(exported.response.status === 200, `Export ${format} failed.`);
  }
  return sessionId;
}

let app: Awaited<ReturnType<typeof createServer>> | undefined;

try {
  const first = await startPackagedServer();
  app = first.app;
  const status = await fetchJson(first.port, "/api/packaged/status");
  assert(status.response.status === 200, "Packaged status failed before session.");
  const storage = (status.body as { data?: { storage?: { migrationStatus?: string; dbPathSanitized?: string } } }).data
    ?.storage;
  assert(storage?.migrationStatus === "ok", "Expected packaged migrations to be ok.");
  assert(!(storage.dbPathSanitized ?? "").includes(tempRoot), "Packaged status leaked full temp path.");

  const sessionId = await runSession(first.port);
  await app.close();
  app = undefined;

  const second = await startPackagedServer();
  app = second.app;
  const restartStatus = await fetchJson(second.port, "/api/packaged/status");
  assert(restartStatus.response.status === 200, "Packaged status failed after restart.");
  const restartedStorage = (
    restartStatus.body as { data?: { storage?: { migrationStatus?: string; sessionsCount?: number; reportsCount?: number } } }
  ).data?.storage;
  assert(restartedStorage?.migrationStatus === "ok", "Migrations failed on same dbPath restart.");
  assert((restartedStorage.sessionsCount ?? 0) >= 1, "Persisted session count missing after restart.");
  assert((restartedStorage.reportsCount ?? 0) >= 1, "Persisted report count missing after restart.");

  const persistedSession = await fetchJson(second.port, `/api/sessions/${sessionId}`);
  assert(persistedSession.response.status === 200, "Persisted session not readable after restart.");
  const persistedReport = await fetchJson(second.port, `/api/sessions/${sessionId}/report`);
  assert(persistedReport.response.status === 200, "Persisted report not readable after restart.");

  console.log("Packaged storage migration smoke test passed");
} finally {
  await app?.close().catch(() => undefined);
  rmSync(tempRoot, { recursive: true, force: true });
}
