import { detectTauri, invokeTauri } from "./tauriClient";

let cachedToken: string | null = null;

export async function getLocalAuthToken(): Promise<string | null> {
  if (!detectTauri()) {
    return null;
  }
  if (cachedToken !== null) {
    return cachedToken;
  }
  cachedToken = await invokeTauri<string>("get_local_auth_token");
  return cachedToken;
}

export function getCachedLocalAuthToken(): string | null {
  return cachedToken;
}

export async function buildLocalAuthHeaders(): Promise<HeadersInit | undefined> {
  const token = await getLocalAuthToken();
  return token === null
    ? undefined
    : {
        Authorization: `Bearer ${token}`
      };
}
