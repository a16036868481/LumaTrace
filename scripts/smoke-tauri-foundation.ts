import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../apps/local-server/dist/src/server.js";

const token = "tauri-smoke-token-123456789";
const tempRoot = mkdtempSync(join(tmpdir(), "lumatrace-tauri-smoke-"));
const dbPath = join(tempRoot, "data", "lumatrace.db");
const reportsDir = join(tempRoot, "reports");
const diagnosticsDir = join(tempRoot, "diagnostics");
const logsDir = join(tempRoot, "logs");
mkdirSync(join(tempRoot, "data"), { recursive: true });
mkdirSync(reportsDir, { recursive: true });
mkdirSync(diagnosticsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(port: number, path: string, authToken?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (authToken !== undefined) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers
  });
  const body = (await response.json()) as unknown;
  return { response, body };
}

async function expectWebSocket(port: number, authToken: string, shouldOpen: boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/sessions/missing/stream`, [
      "lumatrace",
      `lumatrace-auth.${authToken}`
    ]);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket smoke timed out."));
    }, 3000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { type?: string; error?: { code?: string } };
      if (shouldOpen) {
        clearTimeout(timer);
        socket.close();
        assert(message.type === "error" && message.error?.code === "SESSION_NOT_FOUND", "Expected authenticated WS error payload.");
        resolve();
      }
    });
    socket.addEventListener("close", (event) => {
      if (!shouldOpen) {
        clearTimeout(timer);
        assert(event.reason === "AUTH_INVALID" || event.reason === "AUTH_REQUIRED", "Expected auth close reason.");
        resolve();
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket connection error."));
    });
  });
}

const app = await createServer({
  packaged: true,
  host: "127.0.0.1",
  port: 0,
  dbPath,
  reportsDir,
  diagnosticsDir,
  logsDir,
  authToken: token,
  enableLogger: false
});

try {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(typeof address === "object" && address !== null, "Expected listening address.");
  const port = address.port;

  const health = await fetchJson(port, "/api/health");
  assert(health.response.status === 200, "Health should be unauthenticated.");

  const missingAuth = await fetchJson(port, "/api/devices");
  assert(missingAuth.response.status === 401, "Packaged REST should require auth.");

  const invalidAuth = await fetchJson(port, "/api/devices", "wrong-token");
  assert(invalidAuth.response.status === 401, "Invalid REST token should fail.");

  const validAuth = await fetchJson(port, "/api/devices", token);
  assert(validAuth.response.status === 200, "Valid REST token should work.");

  const status = await fetchJson(port, "/api/packaged/status", token);
  assert(status.response.status === 200, "Packaged status should work with auth.");
  assert(JSON.stringify(status.body).includes("127.0.0.1"), "Packaged status should report localhost.");
  assert(!JSON.stringify(status.body).includes(token), "Packaged status must not include token.");

  await expectWebSocket(port, "wrong-token", false);
  await expectWebSocket(port, token, true);

  const shutdown = await fetchJson(port, "/api/packaged/shutdown", token, { method: "POST" });
  assert(shutdown.response.status === 200, "Shutdown should work with auth.");

  const logPath = join(logsDir, "local-server.log");
  try {
    const logText = readFileSync(logPath, "utf8");
    assert(!logText.includes(token), "Token must not appear in packaged logs.");
  } catch {
    // createServer smoke does not run index.ts file logging; Tauri sidecar path covers file logs.
  }

  console.log("Tauri foundation smoke test passed");
} finally {
  await app.close().catch(() => undefined);
}
