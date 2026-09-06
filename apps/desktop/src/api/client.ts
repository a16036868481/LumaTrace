import { ApiError } from "./errors";
import type { ApiEnvelope, ApiFailure } from "./types";
import { buildLocalAuthHeaders } from "../tauri/localAuth";
import { getLocalServerInfo } from "../tauri/tauriClient";

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  authToken?: string;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getDefaultApiBaseUrl(): string {
  return trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? "");
}

function appendQuery(url: URL | string, query: RequestOptions["query"]): string {
  const isAbsolute = typeof url !== "string";
  const searchParams = isAbsolute ? url.searchParams : new URLSearchParams();

  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        searchParams.set(key, value.join(","));
      } else {
        searchParams.set(key, String(value));
      }
    }
  }

  if (isAbsolute) {
    return url.toString();
  }

  const params = searchParams.toString();
  return params.length > 0 ? `${url}?${params}` : url;
}

export function buildApiUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions["query"]
): string {
  const normalizedBase = trimTrailingSlash(baseUrl);
  if (normalizedBase.length > 0) {
    const url = new URL(path, `${normalizedBase}/`);
    return appendQuery(url, query);
  }

  return appendQuery(path, query);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (payload.ok) {
    return payload.data;
  }

  throw new ApiError(payload.error, response.status);
}

async function parseTextExport(response: Response): Promise<string> {
  const text = await response.text();
  if (response.ok) {
    return text;
  }

  try {
    const payload = JSON.parse(text) as ApiFailure;
    if (payload.ok === false) {
      throw new ApiError(payload.error, response.status);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
  }

  throw new ApiError(
    {
      code: "HTTP_ERROR",
      message: `Request failed with status ${response.status}.`
    },
    response.status
  );
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly authToken: string | undefined;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? getDefaultApiBaseUrl());
    this.fetchImpl = options.fetchImpl;
    this.authToken = options.authToken;
  }

  private async resolveBaseUrl(): Promise<string> {
    if (this.baseUrl.length > 0) {
      return this.baseUrl;
    }
    const info = await getLocalServerInfo();
    return trimTrailingSlash(info.apiBaseUrl);
  }

  private async buildHeaders(extraHeaders: HeadersInit = {}): Promise<HeadersInit> {
    const headers = new Headers(extraHeaders);
    if (this.authToken !== undefined) {
      headers.set("Authorization", `Bearer ${this.authToken}`);
      return headers;
    }
    const authHeaders = await buildLocalAuthHeaders();
    if (authHeaders !== undefined) {
      for (const [key, value] of Object.entries(authHeaders)) {
        headers.set(key, value);
      }
    }
    return headers;
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await (this.fetchImpl ?? fetch)(
      buildApiUrl(await this.resolveBaseUrl(), path, options.query),
      {
        method: "GET",
        headers: await this.buildHeaders()
      }
    );
    return parseJsonResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const requestInit: RequestInit = {
      method: "POST"
    };
    if (body !== undefined) {
      requestInit.headers = await this.buildHeaders({
        "content-type": "application/json"
      });
      requestInit.body = JSON.stringify(body);
    } else {
      requestInit.headers = await this.buildHeaders();
    }
    const response = await (this.fetchImpl ?? fetch)(
      buildApiUrl(await this.resolveBaseUrl(), path, options.query),
      {
        ...requestInit
      }
    );
    return parseJsonResponse<T>(response);
  }

  async delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await (this.fetchImpl ?? fetch)(
      buildApiUrl(await this.resolveBaseUrl(), path, options.query),
      {
        method: "DELETE",
        headers: await this.buildHeaders()
      }
    );
    return parseJsonResponse<T>(response);
  }

  async getText(path: string, options: RequestOptions = {}): Promise<string> {
    const response = await (this.fetchImpl ?? fetch)(
      buildApiUrl(await this.resolveBaseUrl(), path, options.query),
      {
        method: "GET",
        headers: await this.buildHeaders()
      }
    );
    return parseTextExport(response);
  }

  async postText(path: string, body?: unknown, options: RequestOptions = {}): Promise<string> {
    const requestInit: RequestInit = {
      method: "POST",
      headers: await this.buildHeaders(
        body === undefined
          ? {}
          : {
              "content-type": "application/json"
            }
      )
    };
    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }
    const response = await (this.fetchImpl ?? fetch)(
      buildApiUrl(await this.resolveBaseUrl(), path, options.query),
      requestInit
    );
    return parseTextExport(response);
  }
}

export function createApiClient(options?: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
