"use client";

import { useState, useCallback } from "react";
import {
  apiFetch,
  MutationQueuedError,
  MutationQueueFullError,
  type ApiFetchConfig,
} from "@/lib/api-fetch";
import { addNotificationEntry } from "@/lib/notifications";
import type { ApiErrorShape } from "@/types";

type ApiState = {
  loading: boolean;
  error: ApiErrorShape | null;
  queued: boolean;
};

export type UseApiRequestOptions = RequestInit & {
  config?: ApiFetchConfig;
};

export function useApi() {
  const [state, setState] = useState<ApiState>({ loading: false, error: null, queued: false });

  const request = useCallback(
    async <T>(url: string, options?: UseApiRequestOptions): Promise<T | null> => {
      const { config, ...init } = options ?? {};
      setState({ loading: true, error: null, queued: false });
      try {
        const res = await apiFetch(url, init, config);
        if (res.status === 204) {
          setState({ loading: false, error: null, queued: false });
          return null;
        }
        const data = await res.json();
        if (!res.ok) {
          setState({ loading: false, error: data as ApiErrorShape, queued: false });
          return null;
        }
        setState({ loading: false, error: null, queued: false });
        return data as T;
      } catch (err) {
        if (err instanceof MutationQueuedError) {
          addNotificationEntry({
            type: "warning",
            message: err.message,
          });
          setState({ loading: false, error: null, queued: true });
          return null;
        }
        if (err instanceof MutationQueueFullError) {
          addNotificationEntry({ type: "error", message: err.message });
          setState({
            loading: false,
            error: {
              ok: false,
              error: {
                code: err.code,
                message: err.message,
                user_message: err.message,
                actions: ["Wait for connection to restore.", "Retry after pending changes sync."],
              },
            },
            queued: false,
          });
          return null;
        }
        const networkErr: ApiErrorShape = {
          ok: false,
          error: {
            code: "NETWORK_ERROR",
            message: "Network request failed",
            user_message: "Network error. Check your connection and try again.",
            actions: ["Check your internet connection.", "Retry in a moment."],
          },
        };
        setState({ loading: false, error: networkErr, queued: false });
        return null;
      }
    },
    []
  );

  const get = useCallback(
    <T>(url: string, config?: ApiFetchConfig) =>
      request<T>(url, { config: { retryOnError: false, queueOnOffline: false, ...config } }),
    [request]
  );

  const post = useCallback(
    <T>(url: string, body: unknown, config?: ApiFetchConfig) =>
      request<T>(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        config,
      }),
    [request]
  );

  const patch = useCallback(
    <T>(url: string, body: unknown, config?: ApiFetchConfig) =>
      request<T>(url, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        config,
      }),
    [request]
  );

  const del = useCallback(
    (url: string, config?: ApiFetchConfig) => request<void>(url, { method: "DELETE", config }),
    [request]
  );

  return { ...state, get, post, patch, del };
}
