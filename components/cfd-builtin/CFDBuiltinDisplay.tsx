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
import {
  AppRegistry,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

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

function CFDWebViewHost() {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    setWebView(webViewRef);
    return () => {
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

  const handleRenderProcessGone = useCallback(
    (event: NativeSyntheticEvent<{ didCrash?: boolean }>) => {
      // eslint-disable-next-line no-console
      console.error(
        "[CFDWebViewHost] WebView renderer process gone",
        event.nativeEvent
      );
      markNotReady();
    },
    []
  );

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
