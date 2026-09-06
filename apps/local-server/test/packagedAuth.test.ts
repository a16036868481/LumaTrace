import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { readEnv } from "../src/config/env";

const apps: Awaited<ReturnType<typeof createServer>>[] = [];

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "lumatrace-packaged-test-")), "lumatrace.db");
}

function writeManifest(root: string): string {
  mkdirSync(root, { recursive: true });
  const artifactPath = join(root, "lumatrace-local-server-x86_64-pc-windows-msvc.cmd");
  writeFileSync(artifactPath, "@echo off\r\n", "utf8");
  const content = "@echo off\r\n";
  const manifestPath = join(root, "sidecar-manifest.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        name: "lumatrace-local-server",
        version: "0.0.0",
        artifactKind: "dev-wrapper",
        platform: "win32",
        arch: "x64",
        targetTriple: "x86_64-pc-windows-msvc",
        fileName: "lumatrace-local-server-x86_64-pc-windows-msvc.cmd",
        sizeBytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        buildTime: new Date(0).toISOString(),
        sourcePackageVersion: "0.0.0",
        nodeRequired: true,
        productionReady: false,
        limitations: ["dev-wrapper"]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  writeFileSync(
    join(root, "lumatrace-windows-packaging-release-readiness.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        evidenceKind: "windows-packaging-release-readiness",
        productionReady: false,
        releaseStatus: "blocked",
        qaDraftStatus: "automated_ready_manual_pending",
        blockers: [
          {
            code: "CODE_SIGNING_NOT_CONFIGURED",
            reason: "Windows production code signing is not configured or verified.",
            requiredForProduction: true
          }
        ],
        checks: {
          codeSigningConfigured: false,
          updaterConfigured: false
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return manifestPath;
}

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close().catch(() => undefined)));
  apps.length = 0;
});

describe("packaged local auth", () => {
  it("keeps dev mode unauthenticated", async () => {
    const app = await createServer({ dbPath: ":memory:", enableLogger: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/devices" });
    expect(response.statusCode).toBe(200);
  });

  it("requires bearer token in packaged mode and sanitizes status", async () => {
    const token = "packaged-test-token-123456789";
    const dbPath = tempDb();
    const manifestPath = writeManifest(join(dbPath, "..", "binaries"));
    const app = await createServer({
      packaged: true,
      host: "127.0.0.1",
      port: 0,
      dbPath,
      reportsDir: join(dbPath, "..", "reports"),
      diagnosticsDir: join(dbPath, "..", "diagnostics"),
      logsDir: join(dbPath, "..", "logs"),
      sidecarManifestPath: manifestPath,
      authToken: token,
      enableLogger: false
    });
    apps.push(app);

    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/devices" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/devices",
          headers: { authorization: "Bearer wrong-token" }
        })
      ).statusCode
    ).toBe(401);
    const devices = await app.inject({
      method: "GET",
      url: "/api/devices",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(devices.statusCode).toBe(200);

    const status = await app.inject({
      method: "GET",
      url: "/api/packaged/status",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(status.statusCode).toBe(200);
    expect(status.body).not.toContain(token);
    expect(status.json()).toMatchObject({
      ok: true,
      data: {
        packaged: true,
        host: "127.0.0.1",
        authRequired: true
      }
    });
    expect(status.json()).toMatchObject({
      data: {
        artifactKind: "dev-wrapper",
        auth: {
          required: true,
          tokenPresent: true
        },
        storage: {
          migrationStatus: "ok"
        },
        limitations: {
          productionReady: false,
          codeSigningConfigured: false,
          updaterConfigured: false,
          releaseStatus: "blocked"
        },
        releaseReadiness: {
          exists: true,
          valid: true,
          releaseStatus: "blocked",
          productionReady: false
        },
        diagnosticsExportAvailable: true,
        sanitizerEnabled: true
      }
    });
    expect(status.json().data.logs).toMatchObject({
      rotationPolicy: {
        maxFileSizeBytes: 10485760,
        maxFiles: 5,
        rotateOnStartup: true,
        rotateWhenThresholdExceeded: true,
        deleteOldest: true
      }
    });

    const invalidExport = await app.inject({
      method: "GET",
      url: "/api/packaged/diagnostics/export?format=json",
      headers: { authorization: "Bearer wrong-token" }
    });
    expect(invalidExport.statusCode).toBe(401);

    const exportResponse = await app.inject({
      method: "GET",
      url: "/api/packaged/diagnostics/export?format=json",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.body).not.toContain(token);
    expect(exportResponse.json()).toMatchObject({
      ok: true,
      data: {
        artifactKind: "dev-wrapper",
        productionReady: false,
        auth: {
          tokenPresent: true,
          tokenRedacted: true
        },
        warnings: expect.arrayContaining([expect.stringMatching(/Raw logs are not included/u)])
      }
    });
    expect(exportResponse.json()).toMatchObject({
      data: {
        releaseReadiness: {
          exists: true,
          releaseStatus: "blocked",
          productionReady: false
        },
        packagedStatus: {
          releaseStatus: "blocked"
        }
      }
    });
  });

  it.each(["/api/sessions", "/api/sessions/session-1"])(
    "allows desktop WebView DELETE preflight for %s",
    async (url) => {
      const token = "packaged-test-token-cors-123456";
      const app = await createServer({
        packaged: true,
        host: "127.0.0.1",
        port: 0,
        dbPath: ":memory:",
        authToken: token,
        enableLogger: false
      });
      apps.push(app);

      const response = await app.inject({
        method: "OPTIONS",
        url,
        headers: {
          origin: "http://tauri.localhost",
          "access-control-request-method": "DELETE",
          "access-control-request-headers": "authorization"
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("http://tauri.localhost");
      expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
      expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    }
  );

  it("requires WebSocket token in packaged mode", async () => {
    const token = "packaged-test-token-abcdefghi";
    const app = await createServer({
      packaged: true,
      host: "127.0.0.1",
      port: 0,
      dbPath: ":memory:",
      authToken: token,
      enableLogger: false
    });
    apps.push(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    expect(typeof address).toBe("object");
    const port = typeof address === "object" && address !== null ? address.port : 0;

    await expect(
      new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/api/sessions/missing/stream`, [
          "lumatrace",
          "lumatrace-auth.wrong-token"
        ]);
        socket.addEventListener("close", (event) => resolve(event.reason));
        socket.addEventListener("error", () => reject(new Error("unexpected ws error")));
      })
    ).resolves.toBe("AUTH_INVALID");

    await expect(
      new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/api/sessions/missing/stream`, [
          "lumatrace",
          `lumatrace-auth.${token}`
        ]);
        socket.addEventListener("message", (event) => {
          const payload = JSON.parse(String(event.data)) as { error?: { code?: string } };
          socket.close();
          resolve(payload.error?.code ?? "");
        });
        socket.addEventListener("error", () => reject(new Error("unexpected ws error")));
      })
    ).resolves.toBe("SESSION_NOT_FOUND");
  });

  it("rejects unsafe packaged host and requires token", () => {
    expect(() =>
      readEnv(
        {
          LUMATRACE_PACKAGED: "1",
          LUMATRACE_HOST: "0.0.0.0",
          LUMATRACE_AUTH_TOKEN: "packaged-test-token-123456789"
        },
        []
      )
    ).toThrow(/127\.0\.0\.1/);
    expect(() => readEnv({ LUMATRACE_PACKAGED: "1", LUMATRACE_HOST: "127.0.0.1" }, [])).toThrow(
      /auth token/
    );
  });
});
