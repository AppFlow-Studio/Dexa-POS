// web/cfd-entry.tsx
// Web-only entry point for the CFD WebView shell.
//
// Mounts `CFDScreenRouter` against an in-memory display store. The host RN
// app (POS) injects state updates via `window.__cfdRecv(payload)` and
// receives user actions (tip / phone / loyalty) via
// `window.ReactNativeWebView.postMessage(...)`.
//
// This entry is bundled to a single static JS file by Metro
// (see scripts/build-cfd-web.js) and packaged into
// android/app/src/main/assets/cfd-web/ so the WebView can load it via
// file:///android_asset/cfd-web/index.html.

import "@/global.css";

import { CFDScreenRouter } from "@/components/cfd-client/CFDScreenRouter";
import {
  setCFDLoyaltyHandlers,
  triggerCFDLoyaltyJoin,
  triggerCFDLoyaltySkip,
  triggerCFDPhoneSubmit,
} from "@/lib/cfdLoyaltyTriggers";
import { setThemeMode } from "@/lib/theme";
import { CFDScaleProvider, UiScaleProvider } from "@/lib/uiScale";
import type {
  CFDMessage,
  CFDPayload,
  CFDPhoneResponse,
  CFDTipResponse,
} from "@/types/cfd.types";
import {
  CFDWebDisplayProvider,
  useCFDWebDisplayStore,
} from "@/web/cfdWebDisplayProvider";
import type { ReactNode } from "react";
import { AppRegistry, StyleSheet, View } from "react-native";

// ---------------------------------------------------------------------------
// Bridge globals
// ---------------------------------------------------------------------------
// These let the host RN side push state in (window.__cfdRecv) and the
// WebView post user actions out (window.ReactNativeWebView.postMessage).

declare global {
  interface Window {
    __cfdRecv?: (payload: Partial<CFDPayload>) => void;
    __cfdReady?: () => void;
    __CFD_INITIAL_SNAPSHOT__?: Partial<CFDPayload>;
    ReactNativeWebView?: {
      postMessage: (data: string) => void;
    };
  }
}

function postToHost(message: CFDMessage) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(message));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[CFDWebView] postMessage failed", err);
  }
}

function applyTheme(mode: "light" | "dark") {
  try {
    setThemeMode(mode);
    // NativeWind v4 web reads `dark:` variants from the html element class.
    // Match the POS so Tailwind dark/light variants resolve correctly inside
    // the WebView's V8.
    const cls = document.documentElement.classList;
    if (mode === "dark") {
      cls.add("dark");
      cls.remove("light");
    } else {
      cls.add("light");
      cls.remove("dark");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[CFDWebView] applyTheme failed", err);
  }
}

function installBridge() {
  const initialSnapshot = window.__CFD_INITIAL_SNAPSHOT__;
  if (initialSnapshot) {
    try {
      useCFDWebDisplayStore.getState().applyPayload(initialSnapshot);
      if (initialSnapshot.themeMode) {
        applyTheme(initialSnapshot.themeMode);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[CFDWebView] initial snapshot failed", err);
    }
  }

  // POS -> WebView: state updates
  window.__cfdRecv = (payload) => {
    try {
      // ── loyalty_prompt is handled natively ──
      // The loyalty phone keypad is rendered natively outside the
      // WebView (see CFDBuiltinDisplay). If the host pushes
      // `screenState: 'loyalty_prompt'`, we strip the field so the
      // WebView store preserves its current state. The WebView
      // stays on the approved screen underneath the native overlay.
      const stripped =
        payload.screenState === "loyalty_prompt"
          ? { ...payload, screenState: undefined }
          : payload;
      const prevTheme = useCFDWebDisplayStore.getState().themeMode;
      useCFDWebDisplayStore.getState().applyPayload(stripped);
      const nextTheme = useCFDWebDisplayStore.getState().themeMode;
      if (prevTheme !== nextTheme) {
        applyTheme(nextTheme);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[CFDWebView] applyPayload failed", err);
    }
  };

  // Apply current theme on bridge install (covers the case where the snapshot
  // was already pushed before this listener was wired up).
  applyTheme(useCFDWebDisplayStore.getState().themeMode);

  // Register loyalty handlers so CFDScreenRouter's fallback path also posts
  // back to the host (defense in depth — the screens already get explicit
  // callbacks below, but if any code path slips through, this catches it).
  setCFDLoyaltyHandlers({
    onJoin: () => {
      postToHost({
        type: "loyalty_join",
        timestamp: Date.now(),
      });
    },
    onPhoneSubmit: (phone: string) => {
      const response: CFDPhoneResponse = { phone, timestamp: Date.now() };
      postToHost({
        type: "phone_submitted",
        payload: response,
        timestamp: Date.now(),
      });
    },
    onSkip: () => {
      postToHost({
        type: "loyalty_skip",
        timestamp: Date.now(),
      });
    },
  });

  // Tell the host we're ready to receive state.
  postToHost({ type: "state_update", timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

function CFDWebApp() {
  // All callbacks postMessage back to the host RN side. The host routes them
  // through `CFDController` callbacks just like an off-device WebSocket CFD.
  // eslint-disable-next-line no-console
  console.log("[cfd-entry] CFDWebApp render");
  const handleTipSelected = (
    tipAmount: number,
    tipPercentage: number | null,
  ) => {
    const response: CFDTipResponse = {
      stationId: "builtin",
      tipAmount,
      tipPercentage,
      timestamp: Date.now(),
    };
    postToHost({
      type: "tip_selected",
      payload: response,
      timestamp: Date.now(),
    });
  };

  const handlePhoneSubmitted = (phone: string) => {
    const response: CFDPhoneResponse = { phone, timestamp: Date.now() };
    postToHost({
      type: "phone_submitted",
      payload: response,
      timestamp: Date.now(),
    });
    // Also kick the legacy fallback path so any in-WebView consumer fires.
    triggerCFDPhoneSubmit(phone);
  };

  const handleLoyaltySkip = () => {
    postToHost({ type: "loyalty_skip", timestamp: Date.now() });
    triggerCFDLoyaltySkip();
  };

  const handleLoyaltyJoin = () => {
    // The loyalty phone prompt is now rendered NATIVELY (outside the
    // WebView) by CFDBuiltinDisplay. We do NOT optimistically set
    // screenState to "loyalty_prompt" here. Instead, we just post
    // the message to the host. The host transitions the shared store
    // to "loyalty_prompt", which triggers:
    //   1. The native overlay in CFDBuiltinDisplay to appear
    //   2. A payload push to this WebView (which we ignore via
    //      __cfdRecv's loyalty_prompt filtering above)
    postToHost({ type: "loyalty_join", timestamp: Date.now() });
    triggerCFDLoyaltyJoin();
  };

  return (
    <View style={rootStyles.root}>
      <CFDWebDisplayProvider>
        <CFDScaledRoot>
          <CFDScreenRouter
            nativeLoyaltyPrompt
            onTipSelected={handleTipSelected}
            onPhoneSubmitted={handlePhoneSubmitted}
            onLoyaltySkip={handleLoyaltySkip}
            onLoyaltyJoin={handleLoyaltyJoin}
          />
        </CFDScaledRoot>
      </CFDWebDisplayProvider>
    </View>
  );
}

/**
 * Emits `--ui-scale` for the WebView tree at the *CFD* scale.
 *
 * This is the one CFD runtime where NativeWind utility classes resolve
 * through the `--ui-scale` CSS variable, so the variable has to reflect the
 * operator's CFD override — not the POS scale. That means UiScaleProvider
 * must sit *below* CFDWebDisplayProvider (where the override arrives via the
 * payload) and below CFDScaleProvider (which is what makes the useUiScale()
 * inside UiScaleProvider resolve to the CFD scale).
 *
 * Ordering matters: hoisting UiScaleProvider above the display data — as it
 * originally was — silently publishes the unscaled POS value, so any
 * `className`-based sizing added to a CFD screen would not scale.
 */
function CFDScaledRoot({ children }: { children: ReactNode }) {
  const override = useCFDWebDisplayStore((s) => s.cfdUiScaleOverride);
  return (
    <CFDScaleProvider override={override}>
      <UiScaleProvider>{children}</UiScaleProvider>
    </CFDScaleProvider>
  );
}

const rootStyles = StyleSheet.create({
  // Defensive: react-native-web's wrapper between #root and our tree can
  // collapse to content height. Force this root View to fill the viewport
  // so absolutely-positioned children (carousel images) have non-zero size.
  root: {
    flex: 1,
    width: "100%" as any,
    height: "100%" as any,
    backgroundColor: "#0a0a0a",
  },
});

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------
// Detailed step logging so a hung boot is diagnosable from `adb logcat`
// (the index.html console shim forwards every level to the RN host).

function removeLoader() {
  try {
    const el = document.getElementById("cfd-loading");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (_) {}
}

function boot() {
  // eslint-disable-next-line no-console
  console.log("[cfd-entry] boot:start ua=", navigator.userAgent);
  // eslint-disable-next-line no-console
  console.log("[cfd-entry] boot:document.readyState=", document.readyState);
  try {
    installBridge();
    // eslint-disable-next-line no-console
    console.log("[cfd-entry] boot:bridge-installed");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cfd-entry] installBridge threw:", err);
  }

  try {
    AppRegistry.registerComponent("CFDWebApp", () => CFDWebApp);
    // eslint-disable-next-line no-console
    console.log("[cfd-entry] boot:component-registered");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cfd-entry] registerComponent threw:", err);
    return;
  }

  const rootTag = document.getElementById("root");
  // eslint-disable-next-line no-console
  console.log(
    "[cfd-entry] boot:#root element found:",
    !!rootTag,
    "children:",
    rootTag?.children?.length ?? 0,
  );
  if (!rootTag) {
    // eslint-disable-next-line no-console
    console.error("[cfd-entry] no #root element on page");
    return;
  }

  try {
    AppRegistry.runApplication("CFDWebApp", { rootTag });
    // eslint-disable-next-line no-console
    console.log("[cfd-entry] boot:runApplication-returned");
    // Drop the placeholder once react-native-web has had a tick to render.
    setTimeout(() => {
      removeLoader();
      // eslint-disable-next-line no-console
      console.log(
        "[cfd-entry] boot:loader-removed, #root innerHTML length:",
        rootTag.innerHTML?.length ?? 0,
      );
    }, 16);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cfd-entry] runApplication threw:", err);
  }
}

boot();
