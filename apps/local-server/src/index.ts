import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readEnv } from "./config/env";
import { ensurePackagedDirectories, sanitizePackagedPath } from "./config/packagedEnv";
import { createServer } from "./server";

const env = readEnv();
if (env.packaged) {
  ensurePackagedDirectories(env);
}
const app = await createServer({
  dbPath: env.dbPath,
  packaged: env.packaged,
  host: env.host,
  port: env.port,
  ...(env.reportsDir === undefined ? {} : { reportsDir: env.reportsDir }),
  ...(env.diagnosticsDir === undefined ? {} : { diagnosticsDir: env.diagnosticsDir }),
  ...(env.logsDir === undefined ? {} : { logsDir: env.logsDir }),
  ...(env.sidecarManifestPath === undefined ? {} : { sidecarManifestPath: env.sidecarManifestPath }),
  ...(env.authToken === undefined ? {} : { authToken: env.authToken }),
  ...(env.parentPid === undefined ? {} : { parentPid: env.parentPid }),
  enableLogger: !env.packaged
});

let closing = false;

function writePackagedLog(message: string, details: Record<string, unknown> = {}): void {
  if (!env.packaged || env.logsDir === undefined) {
    return;
  }
  mkdirSync(env.logsDir, { recursive: true });
  const sanitized = JSON.stringify({
    timestamp: new Date().toISOString(),
    message,
    ...details,
    dbPath: sanitizePackagedPath(env.dbPath),
    logsDir: sanitizePackagedPath(env.logsDir)
  });
  appendFileSync(join(env.logsDir, "local-server.log"), `${sanitized}\n`, "utf8");
}

async function shutdown(signal: string): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  app.log.info({ signal }, "Shutting down LumaTrace local server");
  writePackagedLog("shutdown", { signal });
  await app.close();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({
  host: env.host,
  port: env.port
});

const address = app.server.address();
const actualPort = typeof address === "object" && address !== null ? address.port : env.port;
writePackagedLog("listening", {
  host: env.host,
  port: actualPort,
  packaged: env.packaged,
  reportsDir: sanitizePackagedPath(env.reportsDir),
  diagnosticsDir: sanitizePackagedPath(env.diagnosticsDir)
});

if (env.packaged) {
  process.stdout.write(
    `${JSON.stringify({
      type: "lumatrace.local-server.ready",
      host: env.host,
      port: actualPort,
      packaged: true
    })}\n`
  );
}
