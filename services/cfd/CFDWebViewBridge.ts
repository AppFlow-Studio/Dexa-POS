// services/cfd/CFDWebViewBridge.ts
// Singleton bridging the POS-side React tree and the CFD WebView.
//
// On the POS side:
//   - `CFDBuiltinDisplay` registers its WebView ref via `setWebView(ref)`.
//   - `CFDProvider` calls `pushPayload(payload)` to send state to the WebView,
//     replacing the legacy `useCFDBuiltinStore.getState().update(...)` write.
//
// In the WebView (web/cfd-entry.tsx):
//   - `window.__cfdRecv(payload)` is invoked by `injectJavaScript` and feeds
//     the in-memory display store.
//   - User actions (tip, phone, loyalty) are sent back via
//     `window.ReactNativeWebView.postMessage(JSON)`.
//
// `CFDProvider` registers an action handler via `setActionHandler` to
// receive those messages and route them through the existing CFDController
// callbacks.

import type { CFDMessage } from "@/types/cfd.types";
import type { RefObject } from "react";
import type { WebView } from "react-native-webview";

type WebViewRefType = RefObject<WebView | null>;
type ActionHandler = (message: CFDMessage) => void;
type SnapshotProvider = () => Record<string, unknown>;

let webViewRef: WebViewRefType | null = null;
let actionHandler: ActionHandler | null = null;
let snapshotProvider: SnapshotProvider | null = null;
let webViewReady = false;

export function setWebView(ref: WebViewRefType | null) {
  webViewRef = ref;
  webViewReady = false;
}

export function setActionHandler(handler: ActionHandler | null) {
  actionHandler = handler;
}

/**
 * Register a function that returns the current full CFD display state.
 * Called on `markReady()` to push a snapshot to the WebView so it catches up
 * on every accumulated write — not just the most recent partial. Without
 * this, partial writes (e.g. just `{carouselImages: [...]}`) made before the
 * WebView booted would arrive in isolation, missing the rest of the state.
 */
export function setSnapshotProvider(provider: SnapshotProvider | null) {
  snapshotProvider = provider;
}

/**
 * Called by `CFDBuiltinDisplay` once the WebView has loaded and the bundle
 * has had a tick to install `window.__cfdRecv`. Pushes the full current
 * display state so the WebView starts fully populated.
 */
export function markReady() {
  webViewReady = true;
  if (snapshotProvider) {
    try {
      const snapshot = snapshotProvider();
      pushPayload(snapshot);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[CFDWebViewBridge] snapshot push failed", err);
    }
  }
}

export function markNotReady() {
  webViewReady = false;
}

/**
 * Push a CFD payload (full or partial) into the WebView.
 *
 * - No WebView registered (legacy / non-WebView mode): silent no-op.
 * - WebView registered but still loading: silent drop. The full state
 *   gets pushed on `markReady()` via the snapshot provider, so we don't
 *   need to buffer mid-load partials (which would only keep the last one
 *   and drop earlier writes like `carouselImages`).
 * - WebView ready: payload is injected immediately.
 */
export function pushPayload(payload: Record<string, unknown>) {
  if (!webViewRef || !webViewRef.current) {
    // No WebView mounted — caller is in legacy mode, drop silently.
    return;
  }
  if (!webViewReady) {
    // Drop — markReady will catch up via snapshot.
    return;
  }

  // Wrap in IIFE so any thrown error inside __cfdRecv stays contained.
  // Trailing `true;` is required by RN WebView's injectJavaScript contract
  // (the injected script must end with a truthy statement).
  const json = JSON.stringify(payload);
  const js = `(function(){try{window.__cfdRecv && window.__cfdRecv(${json});}catch(e){console.error('[cfd] recv failed', e);}})(); true;`;
  webViewRef.current.injectJavaScript(js);
}

/**
 * Routes an inbound WebView message to the registered action handler.
 * Called from `CFDBuiltinDisplay`'s `onMessage` prop.
 *
 * Also intercepts diagnostic message types (`cfd_web_log`, `cfd_web_error`)
 * forwarded from the WebView's console shim so they show up in adb logcat
 * — without this, errors inside V8 are invisible from the device.
 */
export function dispatchMessage(rawJson: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[CFDWebView] bad message", err, rawJson);
    return;
  }

  if (parsed?.type === "cfd_web_log") {
    const level: string = parsed.level ?? "log";
    const msg = `[CFDWebView/${level}] ${parsed.msg ?? ""}`;
    if (level === "error") {
      // eslint-disable-next-line no-console
      console.error(msg);
    } else if (level === "warn") {
      // eslint-disable-next-line no-console
      console.warn(msg);
    } else {
      // eslint-disable-next-line no-console
      console.log(msg);
    }
    return;
  }

  if (parsed?.type === "cfd_web_error") {
    // eslint-disable-next-line no-console
    console.error(
      `[CFDWebView/uncaught] ${parsed.message ?? ""}` +
        (parsed.source ? ` at ${parsed.source}:${parsed.line}:${parsed.col}` : "") +
        (parsed.stack ? `\n${parsed.stack}` : "")
    );
    return;
  }

  if (!actionHandler) return;
  actionHandler(parsed as CFDMessage);
}

/**
 * For the WebView host side: did the bundle indicate it's running?
 * Used by CFDProvider to decide whether to route updates through the bridge
 * vs. the legacy useCFDBuiltinStore write path.
 */
export function isWebViewActive(): boolean {
  return webViewRef?.current !== null && webViewRef?.current !== undefined;
}
