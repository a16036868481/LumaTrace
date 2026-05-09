import { useCallback, useEffect, useState, type DependencyList } from "react";
import { normalizeApiError } from "../api/errors";
import type { ApiError } from "../api/errors";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function loadWithClientRetry<T>(loader: () => Promise<T>): Promise<T> {
  const retryDelaysMs = [200, 500, 1000, 1500];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await loader();
    } catch (error) {
      const apiError = normalizeApiError(error);
      if (apiError.code !== "CLIENT_ERROR" || attempt === retryDelaysMs.length) {
        throw apiError;
      }
      lastError = apiError;
      await delay(retryDelaysMs[attempt] ?? 0);
    }
  }

  throw normalizeApiError(lastError);
}

export function useAsync<T>(loader: () => Promise<T>, dependencies: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadIndex, setReloadIndex] = useState(0);

  const reload = useCallback(() => {
    setReloadIndex((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    loadWithClientRetry(loader)
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(normalizeApiError(caught));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [...dependencies, reloadIndex]);

  return {
    data,
    error,
    loading,
    reload
  };
}
