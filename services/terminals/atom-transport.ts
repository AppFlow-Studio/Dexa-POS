// ============================================================
// ATOM Transport — loopback HTTPS via the native AtomBridge
// File: services/terminals/atom-transport.ts
// ============================================================
// Thin HTTP helper for the on-device ATOM REST API. All requests go through the
// native AtomBridge module (loopback-only insecure OkHttpClient) because ATOM's
// self-signed cert (CN=localhost, no SAN) is rejected by RN's default fetch.
//
// This is the SINGLE place the loopback transport concern lives — if the native
// module is ever replaced (e.g. a cert-pinning fetch), only this file changes.
// ============================================================

import { atomBridgeRequest, isAtomBridgeAvailable } from "@/native/AtomBridge";
import { ATOM_LOOPBACK_HOST } from "@/types/atom";

export interface AtomHttpOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  timeoutMs: number;
}

export interface AtomHttpResult<T> {
  /** true iff a 2xx response was received. */
  ok: boolean;
  /** HTTP status; 0 means no response was received (network/TLS/timeout/abort). */
  status: number;
  data?: T;
  /** Error string from a non-2xx body ({error}) or a transport failure. */
  error?: string;
}

export function atomBaseUrl(host: string, port: number): string {
  return `https://${host}:${port}`;
}

/** True when we can talk to a loopback ATOM app on this platform/build. */
export function atomTransportReady(): boolean {
  return isAtomBridgeAvailable();
}

export async function atomFetch<T>(
  base: string,
  opts: AtomHttpOptions,
): Promise<AtomHttpResult<T>> {
  if (!isAtomBridgeAvailable()) {
    return { ok: false, status: 0, error: "AtomBridge unavailable" };
  }
  const url = `${base}${opts.path}`;
  const bodyStr = opts.body != null ? JSON.stringify(opts.body) : null;

  try {
    const res = await atomBridgeRequest(opts.method, url, bodyStr, opts.timeoutMs);
    if (res.networkError || res.status === 0) {
      return { ok: false, status: 0, error: res.error ?? "network error" };
    }
    let data: T | undefined;
    if (res.body) {
      try {
        data = JSON.parse(res.body) as T;
      } catch {
        // Non-JSON body — leave data undefined; surface a generic error on failure.
      }
    }
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      status: res.status,
      data,
      error: ok ? undefined : (data as { error?: string } | undefined)?.error,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Convenience: the loopback base URL for a discovered port. */
export function atomLoopbackBase(port: number): string {
  return atomBaseUrl(ATOM_LOOPBACK_HOST, port);
}
