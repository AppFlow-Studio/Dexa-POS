import { NativeModules, Platform } from "react-native";

/**
 * JS bridge to the native AtomBridge module (Android only).
 *
 * The on-device ATOM payment app serves HTTPS on loopback with a self-signed
 * cert (CN=localhost, no SAN). React Native's default fetch/OkHttp rejects it,
 * so all ATOM HTTP goes through this native module, which uses a loopback-only
 * insecure OkHttpClient. See AtomBridgeModule.kt.
 */

export interface AtomBridgeHttpResult {
  /** HTTP status (200/400/500…). 0 + networkError=true means no response was received. */
  status: number;
  body: string;
  networkError: boolean;
  error?: string;
}

interface AtomBridgeNative {
  request(
    method: "GET" | "POST",
    url: string,
    body: string | null,
    timeoutMs: number,
  ): Promise<AtomBridgeHttpResult>;
  bringToForeground(): Promise<boolean>;
}

const nativeModule = (NativeModules as { AtomBridgeModule?: AtomBridgeNative })
  .AtomBridgeModule;

export function isAtomBridgeAvailable(): boolean {
  return Platform.OS === "android" && !!nativeModule;
}

/**
 * Perform a loopback HTTPS request against the on-device ATOM app.
 * Rejects if the native module is unavailable or the host is not loopback.
 */
export function atomBridgeRequest(
  method: "GET" | "POST",
  url: string,
  body: string | null,
  timeoutMs: number,
): Promise<AtomBridgeHttpResult> {
  if (!nativeModule) {
    return Promise.reject(new Error("AtomBridge native module is not available"));
  }
  return nativeModule.request(method, url, body, timeoutMs);
}

/**
 * Re-foreground the POS after an ATOM transaction (ATOM does not relaunch the POS).
 * Best-effort — resolves false on any failure rather than throwing.
 */
export async function atomBringPosToForeground(): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    return await nativeModule.bringToForeground();
  } catch {
    return false;
  }
}
