import { API_URL } from '../constants/env';
import { getToken, logout, refreshAccessToken } from './auth';

// Mirrors calbook's auth.interceptor.ts: attaches the bearer token to
// every request, and on a 401 tries the cookie-backed refresh flow once
// before giving up. `onUnauthorized` lets the caller react when a session
// can't be recovered (e.g. bounce back to the login screen).
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Concurrent requests that 401 around the same time (e.g. a screen firing
// several calls at once) share one in-flight refresh instead of each
// racing their own — same dedupe as the web's refreshInProgress flag.
let refreshPromise: Promise<string> | null = null;

function refreshAccessTokenOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function authFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token = await getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token ?? ''}`,
      // Without this, the Laravel backend can't tell this is an API
      // client — on an expired/invalid token it 302-redirects to its own
      // /login page (browser-style) instead of returning 401 JSON. fetch()
      // follows that redirect automatically, lands on a path that 404s on
      // this API-only domain, and the real "your session expired" turns
      // into a baffling "Request failed (404)".
      Accept: 'application/json',
    },
  });

  if (response.status === 401 && !retried) {
    try {
      await refreshAccessTokenOnce();
    } catch (err) {
      // fetch rejects with a TypeError when the request never got a
      // response (offline, DNS, timeout). That says nothing about the
      // session, so don't sign the user out over it — especially from the
      // background notification job, which often runs on flaky networks.
      if (err instanceof TypeError) {
        throw err;
      }
      await logout();
      onUnauthorized?.();
      return response;
    }
    return authFetch(path, init, true);
  }

  if (response.status === 401) {
    await logout();
    onUnauthorized?.();
  }

  return response;
}

export async function authFetchJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.message ?? body?.error ?? `Request failed (${response.status})`,
    );
  }
  return response.json();
}
