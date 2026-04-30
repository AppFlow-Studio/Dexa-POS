// components/cfd-builtin/CFDBuiltinDisplay.tsx
// Root component for the built-in secondary display ReactRootView.
// Registered via AppRegistry so Kotlin's SecondaryDisplayPresentation can mount it.
//
// Two render paths:
//   - Default (legacy): mounts the React tree directly. Shares the Hermes JS
//     thread with the POS, which causes app-wide lag on Landi C20Pro.
//   - WebView (EXPO_PUBLIC_CFD_WEBVIEW_PHASE0=1): mounts a WebView pointing
//     at android/app/src/main/assets/cfd-web/index.html. Chromium gives the
//     CFD its own V8 renderer process, isolating the JS thread from Hermes.
//
// The WebView path uses `services/cfd/CFDWebViewBridge` to communicate with
// `CFDProvider` via `injectJavaScript` (POS->WebView) and `onMessage`
// (WebView->POS). Same `CFDPayload` JSON contract as the off-device WS CFD.
import "@/global.css";

import { CFDScreenRouter } from "@/components/cfd-client/CFDScreenRouter";
import { CFDBuiltinDisplayProvider } from "@/contexts/CFDDisplayDataContext";
import {
  dispatchMessage,
  markNotReady,
  markReady,
  setWebView,
} from "@/services/cfd/CFDWebViewBridge";
import React, { useCallback, useEffect, useRef } from "react";
import { AppRegistry, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewRenderProcessGoneEvent,
} from "react-native-webview/lib/WebViewTypes";

const USE_WEBVIEW = process.env.EXPO_PUBLIC_CFD_WEBVIEW_PHASE0 === "1";

/**
 * Error boundary for the built-in secondary display.
 *
 * This React root has NO Sentry wrapper and is separate from the main app's
 * error boundaries. Without this, any uncaught render error propagates to the
 * native layer as a fatal JavascriptException, causing Android to show a brief
 * system crash dialog on the Presentation window.
 *
 * Shows a plain dark screen (invisible to customers) and auto-recovers after 5s.
 */
class CFDBuiltinErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[CFDBuiltinErrorBoundary]", error, info.componentStack);
    this.recoveryTimer = setTimeout(() => {
      this.setState({ hasError: false });
    }, 5000);
  }

  componentWillUnmount() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
  }

  render() {
    if (this.state.hasError) {
      return <View style={styles.root} />;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// WebView shell
// ---------------------------------------------------------------------------
// Loads the bundled CFD UI from android/app/src/main/assets/cfd-web/.
// Communicates with CFDProvider via the CFDWebViewBridge singleton.

const CFD_BUNDLE_URI = "file:///android_asset/cfd-web/index.html";

const RELOAD_DELAY_MS = 250;
const RELOAD_WINDOW_MS = 30_000;
const RELOAD_MAX_IN_WINDOW = 3;

function CFDWebViewHost() {
  const webViewRef = useRef<WebView>(null);
  const reloadTimestampsRef = useRef<number[]>([]);
  const pendingReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setWebView(webViewRef);
    return () => {
      if (pendingReloadRef.current) {
        clearTimeout(pendingReloadRef.current);
        pendingReloadRef.current = null;
      }
      reloadTimestampsRef.current = [];
      markNotReady();
      setWebView(null);
    };
  }, []);

  const handleLoadEnd = useCallback(() => {
    // Give the bundle a tick to install window.__cfdRecv before flushing.
    requestAnimationFrame(() => {
      markReady();
    });
  }, []);

  const handleLoadStart = useCallback(() => {
    markNotReady();
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    dispatchMessage(event.nativeEvent.data);
  }, []);

  const scheduleReload = useCallback((reason: string) => {
    if (pendingReloadRef.current) return;

    const now = Date.now();
    const recent = reloadTimestampsRef.current.filter(
      (t) => now - t < RELOAD_WINDOW_MS
    );
    if (recent.length >= RELOAD_MAX_IN_WINDOW) {
      console.warn(
        `[CFDWebViewHost] reload circuit breaker tripped (${recent.length} reloads in ${RELOAD_WINDOW_MS}ms) — skipping reload after ${reason}`
      );
      reloadTimestampsRef.current = recent;
      return;
    }
    recent.push(now);
    reloadTimestampsRef.current = recent;

    pendingReloadRef.current = setTimeout(() => {
      pendingReloadRef.current = null;
      console.warn(`[CFDWebViewHost] reloading after ${reason}`);
      try {
        webViewRef.current?.reload();
      } catch (e) {
        console.error("[CFDWebViewHost] reload() threw", e);
      }
    }, RELOAD_DELAY_MS);
  }, []);

  const handleRenderProcessGone = useCallback(
    (event: WebViewRenderProcessGoneEvent) => {
      const didCrash = event.nativeEvent?.didCrash;
      console.warn(
        `[CFDWebViewHost] WebView renderer process gone didCrash=${didCrash}`
      );
      markNotReady();
      scheduleReload(`renderer gone (didCrash=${didCrash})`);
      // Returning true tells react-native-webview we handled the crash so it
      // does not re-throw RenderProcessGoneException up the native chain.
      return true;
    },
    [scheduleReload]
  );

  const handleContentProcessDidTerminate = useCallback(() => {
    // iOS-equivalent of onRenderProcessGone. Wired up so the same recovery
    // path applies if this CFD ever runs on iPad.
    console.warn("[CFDWebViewHost] WebView content process terminated");
    markNotReady();
    scheduleReload("content process terminated");
  }, [scheduleReload]);

  const handleError = useCallback((event: WebViewErrorEvent) => {
    const { code, description, url } = event.nativeEvent;
    console.warn(
      `[CFDWebViewHost] onError code=${code} desc=${description} url=${url}`
    );
    markNotReady();
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const { statusCode, description, url } = event.nativeEvent;
    console.warn(
      `[CFDWebViewHost] onHttpError status=${statusCode} desc=${description} url=${url}`
    );
  }, []);

  return (
    <View style={styles.root}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ uri: CFD_BUNDLE_URI }}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onRenderProcessGone={handleRenderProcessGone}
        onContentProcessDidTerminate={handleContentProcessDidTerminate}
        onError={handleError}
        onHttpError={handleHttpError}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        overScrollMode="never"
        scrollEnabled={false}
        bounces={false}
        cacheEnabled
        style={styles.webview}
      />
    </View>
  );
}

function CFDBuiltinDisplay() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <CFDBuiltinErrorBoundary>
        <SafeAreaProvider>
          {USE_WEBVIEW ? (
            <CFDWebViewHost />
          ) : (
            <CFDBuiltinDisplayProvider>
              <View style={styles.root}>
                <CFDScreenRouter />
              </View>
            </CFDBuiltinDisplayProvider>
          )}
        </SafeAreaProvider>
      </CFDBuiltinErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
});

AppRegistry.registerComponent("CFDSecondaryDisplay", () => CFDBuiltinDisplay);
