// Client-side fetch wrapper for the shared Dragon backend.
// Bearer token from localStorage (set on sign-in).

import { getSharedConfig } from "./config";

/**
 * localStorage key for the session bearer token. Same key across all
 * Dragon-brand apps — localStorage is per-origin so DragonBot's and
 * Dragon Refunds' tokens don't collide even sharing the key.
 */
export const SESSION_KEY = "dragonbot_session";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type FetchOpts = RequestInit & { auth?: boolean };

function readToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { auth = true, headers, ...rest } = opts;
  const apiUrl = getSharedConfig().apiUrl;
  const url = path.startsWith("http") ? path : `${apiUrl}${path}`;

  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Content-Type") && rest.body && !(rest.body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = readToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...rest, headers: finalHeaders, credentials: "omit" });
  const text = await res.text();
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // leave as text
    }
  }

  if (!res.ok) {
    // Backend errors come back as { error: "Title", detail?: "Specifics" }.
    // Surface both when present so operator-facing failures make it to
    // the toast.
    const errStr =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null;
    const detailStr =
      body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string"
        ? (body as { detail: string }).detail
        : null;
    const message =
      (errStr && detailStr ? `${errStr}: ${detailStr}` : errStr) ??
      `Request failed: ${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}
