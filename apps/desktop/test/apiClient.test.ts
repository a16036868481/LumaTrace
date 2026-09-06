import { describe, expect, it, vi } from "vitest";
import { ApiClient, buildApiUrl } from "../src/api/client";
import type { ApiError } from "../src/api/errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("ApiClient", () => {
  it("parses successful API envelopes", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        data: {
          status: "ok"
        }
      })
    );
    const client = new ApiClient({ baseUrl: "http://server", fetchImpl });

    await expect(client.get("/api/health")).resolves.toEqual({ status: "ok" });
  });

  it("converts API error envelopes to ApiError", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          ok: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Session not found"
          }
        },
        404
      )
    );
    const client = new ApiClient({ baseUrl: "http://server", fetchImpl });

    await expect(client.get("/api/sessions/missing/report")).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      status: 404
    } satisfies Partial<ApiError>);
  });

  it("returns export text responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("timestampMs\n", { status: 200 }));
    const client = new ApiClient({ baseUrl: "http://server", fetchImpl });

    await expect(client.getText("/api/sessions/one/export")).resolves.toBe("timestampMs\n");
  });

  it("posts localized HTML export payloads and returns text", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("<!doctype html>", { status: 200 }));
    const client = new ApiClient({ baseUrl: "http://server", fetchImpl });

    await expect(
      client.postText("/api/sessions/one/export", {
        format: "html",
        localization: { locale: "zh-CN" }
      })
    ).resolves.toBe("<!doctype html>");

    const [, init] = fetchImpl.mock.calls[0] as Parameters<typeof fetch>;
    expect(init?.method).toBe("POST");
    expect(init?.body).toContain('"locale":"zh-CN"');
  });

  it("deletes a resource with local authentication headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: { sessionId: "session-one", deleted: true }
      })
    );
    const client = new ApiClient({
      baseUrl: "http://server",
      authToken: "local-token",
      fetchImpl
    });

    await expect(client.delete("/api/sessions/session-one")).resolves.toEqual({
      sessionId: "session-one",
      deleted: true
    });

    const [, init] = fetchImpl.mock.calls[0] as Parameters<typeof fetch>;
    expect(init?.method).toBe("DELETE");
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer local-token");
  });

  it("builds query params", () => {
    expect(
      buildApiUrl("http://server", "/api/sessions/one/metrics", {
        metricNames: ["fps", "cpu_percent"],
        limit: 10
      })
    ).toBe("http://server/api/sessions/one/metrics?metricNames=fps%2Ccpu_percent&limit=10");
  });

  it("builds downsampled metric query params", () => {
    expect(
      buildApiUrl("http://server", "/api/sessions/one/metrics/downsampled", {
        metricNames: ["cpu_percent", "memory_mb"],
        bucketSizeMs: 5000,
        limit: 250
      })
    ).toBe(
      "http://server/api/sessions/one/metrics/downsampled?metricNames=cpu_percent%2Cmemory_mb&bucketSizeMs=5000&limit=250"
    );
  });

  it("uses Tauri local-server info and memory-only auth token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: []
      })
    );
    const invoke = <T>(command: string): Promise<T> => {
      if (command === "get_local_server_info") {
        return Promise.resolve({
          mode: "packaged",
          apiBaseUrl: "http://127.0.0.1:49152",
          wsBaseUrl: "ws://127.0.0.1:49152"
        } as T);
      }
      if (command === "get_local_auth_token") {
        return Promise.resolve("memory-only-token" as T);
      }
      return Promise.resolve({} as T);
    };
    window.__TAURI__ = {
      core: {
        invoke
      }
    };
    const client = new ApiClient({ fetchImpl });

    await client.get("/api/devices");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:49152/api/devices",
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );
    const [, init] = fetchImpl.mock.calls[0] as Parameters<typeof fetch>;
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer memory-only-token");
    expect(localStorage.getItem("memory-only-token")).toBeNull();
    delete window.__TAURI__;
  });
});
