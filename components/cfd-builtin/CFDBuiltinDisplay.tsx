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

import { NativeLoyaltyConfirmationScreen } from "@/components/cfd-builtin/NativeLoyaltyConfirmationScreen";
import { NativeLoyaltyPromptScreen } from "@/components/cfd-builtin/NativeLoyaltyPromptScreen";
import { CFDScreenRouter } from "@/components/cfd-client/CFDScreenRouter";
import { CFDBuiltinDisplayProvider } from "@/contexts/CFDDisplayDataContext";
import {
  triggerCFDLoyaltySkip,
  triggerCFDPhoneSubmit,
} from "@/lib/cfdLoyaltyTriggers";
import {
  dispatchMessage,
  markNotReady,
  markReady,
  setWebView,
} from "@/services/cfd/CFDWebViewBridge";
import { CFDScaleProvider, UiScaleProvider } from "@/lib/uiScale";
import { useCFDBuiltinStore } from "@/stores/useCFDBuiltinStore";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { AppRegistry, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useShallow } from "zustand/react/shallow";
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewRenderProcessGoneEvent,
} from "react-native-webview/lib/WebViewTypes";

const USE_WEBVIEW = process.env.EXPO_PUBLIC_CFD_WEBVIEW_PHASE0 === "1";

// Module-level log — fires once when the bundle loads this module,
// before any React component renders. Absence means the module never loaded.
console.log(
  `[CFDBuiltinDisplay] module loaded USE_WEBVIEW=${USE_WEBVIEW} env=${process.env.EXPO_PUBLIC_CFD_WEBVIEW_PHASE0}`,
);

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
  const initialSnapshot = useCFDBuiltinStore(
    useShallow((s) => ({
      screenState: s.screenState,
      serverName: s.serverName,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      orderNumber: s.orderNumber,
      orderType: s.orderType,
      tableName: s.tableName,
      guestCount: s.guestCount,
      items: s.items,
      subtotal: s.subtotal,
      subtotalCash: s.subtotalCash,
      subtotalCard: s.subtotalCard,
      discountAmount: s.discountAmount,
      taxAmount: s.taxAmount,
      taxCash: s.taxCash,
      taxCard: s.taxCard,
      tipAmount: s.tipAmount,
      tipPercentage: s.tipPercentage,
      total: s.total,
      totalCash: s.totalCash,
      totalCard: s.totalCard,
      savingsAmount: s.savingsAmount,
      outstandingTotal: s.outstandingTotal,
      amountPaid: s.amountPaid,
      branding: s.branding,
      layout: s.layout,
      orderingPanelImages: s.orderingPanelImages,
      tipConfig: s.tipConfig,
      carouselImages: s.carouselImages,
      loyaltyPrompt: s.loyaltyPrompt,
      loyaltyResult: s.loyaltyResult,
      paymentMethod: s.paymentMethod,
      merchantHasLoyalty: s.merchantHasLoyalty,
      themeMode: s.themeMode,
    })),
  );
  const initialSnapshotScript = useMemo(() => {
    return `window.__CFD_INITIAL_SNAPSHOT__=${JSON.stringify(
      initialSnapshot,
    )}; true;`;
  }, [initialSnapshot]);

  // ── Native loyalty phone-prompt overlay ──
  // When the host transitions to `loyalty_prompt`, we COMPLETELY
  // UNMOUNT the WebView and render NativeLoyaltyPromptScreen in its
  // place. This avoids Android hardware-layer compositing conflicts
  // (WebView with androidLayerType="hardware" renders in a separate
  // window plane above React Native views). The native keypad uses
  // plain TouchableOpacity on the Hermes thread with zero V8 touch
  // corruption.
  //
  // When the customer submits/skips, the host flips screenState to
  // `loyalty_confirmation` or `idle`. The WebView remounts, boots,
  // and receives the new state via the bridge's snapshot flush.
  const nativeLoyaltyScreen = useCFDBuiltinStore((s) =>
    s.screenState === "loyalty_prompt" ||
    s.screenState === "loyalty_confirmation"
      ? s.screenState
      : null,
  );

  // Operator's CFD-only scale (Settings > Customer Display), mirrored into
  // the built-in store by CFDProvider.
  const cfdUiScaleOverride = useCFDBuiltinStore((s) => s.cfdUiScaleOverride);

  // Bridge registration tied to WebView mount status.
  // When the WebView unmounts (native overlay active), we unregister
  // so stray injectJavaScript calls are no-ops. When it remounts,
  // we re-register with the new WebView instance.
  const webViewMounted = nativeLoyaltyScreen == null;
  useEffect(() => {
    if (!webViewMounted) {
      console.log("[CFDWebViewHost] WebView unmounted — clearing bridge");
      markNotReady();
      setWebView(null);
      return;
    }
    console.log("[CFDWebViewHost] WebView mounted — registering bridge");
    setWebView(webViewRef);
    return () => {
      console.log("[CFDWebViewHost] WebView unmounting — clearing bridge");
      if (pendingReloadRef.current) {
        clearTimeout(pendingReloadRef.current);
        pendingReloadRef.current = null;
      }
      reloadTimestampsRef.current = [];
      markNotReady();
      setWebView(null);
    };
  }, [webViewMounted]);

  const handleLoadEnd = useCallback(() => {
    console.log("[CFDWebViewHost] onLoadEnd — scheduling markReady via rAF");
    webViewRef.current?.injectJavaScript(`
      (function(){
        try {
          var scripts = Array.prototype.slice.call(document.scripts || []).map(function(s){
            return { src: s.src, readyState: s.readyState || null };
          });
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'cfd_web_log',
            level: 'info',
            msg: '[CFDWebViewHostProbe] href=' + location.href +
              ' readyState=' + document.readyState +
              ' scripts=' + JSON.stringify(scripts) +
              ' hasRecv=' + (typeof window.__cfdRecv) +
              ' rootLength=' + ((document.getElementById('root') || {}).innerHTML || '').length,
            ts: Date.now()
          }));
        } catch (e) {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'cfd_web_error',
            message: '[CFDWebViewHostProbe] ' + (e && e.message ? e.message : String(e)),
            stack: e && e.stack ? e.stack : null,
            ts: Date.now()
          }));
        }
      })(); true;
    `);
    // Give the bundle a tick to install window.__cfdRecv before flushing.
    requestAnimationFrame(() => {
      console.log("[CFDWebViewHost] markReady called");
      markReady();
    });
  }, []);

  const handleLoadStart = useCallback(() => {
    console.log("[CFDWebViewHost] onLoadStart — loading", CFD_BUNDLE_URI);
    markNotReady();
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    dispatchMessage(event.nativeEvent.data);
  }, []);

  const scheduleReload = useCallback((reason: string) => {
    if (pendingReloadRef.current) return;

    const now = Date.now();
    const recent = reloadTimestampsRef.current.filter(
      (t) => now - t < RELOAD_WINDOW_MS,
    );
    if (recent.length >= RELOAD_MAX_IN_WINDOW) {
      console.warn(
        `[CFDWebViewHost] reload circuit breaker tripped (${recent.length} reloads in ${RELOAD_WINDOW_MS}ms) — skipping reload after ${reason}`,
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
        `[CFDWebViewHost] WebView renderer process gone didCrash=${didCrash}`,
      );
      markNotReady();
      scheduleReload(`renderer gone (didCrash=${didCrash})`);
      // Returning true tells react-native-webview we handled the crash so it
      // does not re-throw RenderProcessGoneException up the native chain.
      return true;
    },
    [scheduleReload],
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
      `[CFDWebViewHost] onError code=${code} desc=${description} url=${url}`,
    );
    markNotReady();
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const { statusCode, description, url } = event.nativeEvent;
    console.warn(
      `[CFDWebViewHost] onHttpError status=${statusCode} desc=${description} url=${url}`,
    );
  }, []);

  return (
    <View style={styles.root}>
      {nativeLoyaltyScreen ? (
        // ── Native phone-entry overlay ──
        // WebView is completely unmounted to avoid Android
        // hardware-layer compositing conflicts. NativeLoyalty
        // uses plain TouchableOpacity + React state (no
        // setNativeProps — removed in RN 0.76+).
        /* CFDScaleProvider sits outside UiScaleProvider so the operator's
           CFD-only scale feeds both the `--ui-scale` variable and the
           useUiScale() calls inside this overlay — it renders outside
           CFDScreenRouter, which is where the rest of the CFD gets it. */
        <CFDScaleProvider override={cfdUiScaleOverride}>
          <UiScaleProvider>
            <View style={styles.root}>
              <CFDBuiltinDisplayProvider>
                {nativeLoyaltyScreen === "loyalty_prompt" ? (
                  <NativeLoyaltyPromptScreen
                    onPhoneSubmitted={triggerCFDPhoneSubmit}
                    onSkip={triggerCFDLoyaltySkip}
                  />
                ) : (
                  <NativeLoyaltyConfirmationScreen />
                )}
              </CFDBuiltinDisplayProvider>
            </View>
          </UiScaleProvider>
        </CFDScaleProvider>
      ) : (
        // ── WebView for all non-loyalty-prompt screens ──
        // Boots fresh after native overlay dismisses. Bridge's
        // snapshot push (fired on markReady) supplies current
        // screenState so WebView transitions directly to the
        // right screen.
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ uri: CFD_BUNDLE_URI }}
          injectedJavaScriptBeforeContentLoaded={initialSnapshotScript}
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
      )}
    </View>
  );
}

function CFDBuiltinDisplay() {
  console.log(
    `[CFDBuiltinDisplay] render USE_WEBVIEW=${USE_WEBVIEW} PHASE0_ENV=${process.env.EXPO_PUBLIC_CFD_WEBVIEW_PHASE0}`,
  );
  return (
    <GestureHandlerRootView style={styles.root}>
      <CFDBuiltinErrorBoundary>
        <SafeAreaProvider>
          {USE_WEBVIEW ? (
            <CFDWebViewHost />
          ) : (
            <UiScaleProvider>
              <CFDBuiltinDisplayProvider>
                <View style={styles.root}>
                  <CFDScreenRouter />
                </View>
              </CFDBuiltinDisplayProvider>
            </UiScaleProvider>
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
