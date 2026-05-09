import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";

const apps: Awaited<ReturnType<typeof createServer>>[] = [];

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close().catch(() => undefined)));
  apps.length = 0;
});

describe("packaged storage status", () => {
  it("reports migrations, counts, and sanitized paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-packaged-storage-test-"));
    const dataDir = join(root, "data");
    const reportsDir = join(root, "reports");
    const diagnosticsDir = join(root, "diagnostics");
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(reportsDir, { recursive: true });
    mkdirSync(diagnosticsDir, { recursive: true });
    const app = await createServer({
      packaged: true,
      host: "127.0.0.1",
      port: 0,
      dbPath: join(dataDir, "lumatrace.db"),
      reportsDir,
      diagnosticsDir,
      logsDir: join(root, "logs"),
      authToken: "packaged-storage-token-123456789",
      enableLogger: false
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/packaged/status",
      headers: { authorization: "Bearer packaged-storage-token-123456789" }
    });
    expect(response.statusCode).toBe(200);
    const status = response.json().data.storage;
    expect(status.dbExists).toBe(true);
    expect(status.migrationStatus).toBe("ok");
    expect(status.migrationVersions).toContain("001_initial");
    expect(status.sessionsCount).toBe(0);
    expect(status.reportsCount).toBe(0);
    expect(status.reportsDirExists).toBe(true);
    expect(status.diagnosticsDirExists).toBe(true);
    expect(JSON.stringify(status)).not.toContain(root);
  });
});
