"use client";

import { useState, useCallback } from "react";
import type { ApiErrorShape } from "@/types";

type ApiState = {
  loading: boolean;
  error: ApiErrorShape | null;
};

export function useApi() {
  const [state, setState] = useState<ApiState>({ loading: false, error: null });

  const request = useCallback(
    async <T>(url: string, options?: RequestInit): Promise<T | null> => {
      setState({ loading: true, error: null });
      try {
        const res = await fetch(url, {
          headers: { "Content-Type": "application/json" },
          ...options,
        });
        if (res.status === 204) {
          setState({ loading: false, error: null });
          return null;
        }
        const data = await res.json();
        if (!res.ok) {
          setState({ loading: false, error: data as ApiErrorShape });
          return null;
        }
        setState({ loading: false, error: null });
        return data as T;
      } catch {
        const err: ApiErrorShape = {
          ok: false,
          error: {
            code: "NETWORK_ERROR",
            message: "Network request failed",
            user_message: "Network error. Check your connection and try again.",
            actions: ["Check your internet connection.", "Retry in a moment."],
          },
        };
        setState({ loading: false, error: err });
        return null;
      }
    },
    []
  );

  const get = useCallback(
    <T>(url: string) => request<T>(url),
    [request]
  );

  const post = useCallback(
    <T>(url: string, body: unknown) =>
      request<T>(url, { method: "POST", body: JSON.stringify(body) }),
    [request]
  );

  const patch = useCallback(
    <T>(url: string, body: unknown) =>
      request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
    [request]
  );

  const del = useCallback(
    (url: string) => request<void>(url, { method: "DELETE" }),
    [request]
  );

  return { ...state, get, post, patch, del };
}
