import "@/global.css";
import "@/lib/screenConfig";
import { PortalHost } from "@rn-primitives/portal";
import { PortalProvider } from "react-native-teleport";

import { ClerkSessionKeeper } from "@/components/auth/ClerkSessionKeeper";
import ClockInWallModal from "@/components/auth/ClockInWallModal";
import ManagerPinModal from "@/components/auth/ManagerPinModal";
import CustomerSheet from "@/components/bill/CustomerSheet";
import { ProductionErrorBoundary } from "@/components/ErrorBoundary";
import ItemCustomizationDialog from "@/components/menu/ItemCustomizationDialog";
import SearchBottomSheet from "@/components/menu/SearchBottomSheet";
import { NoPrinterModal } from "@/components/printing/NoPrinterModal";
// SyncStatusBar removed - now using NetworkStatusBadge in Header
// import { SyncStatusBar } from "@/components/SyncStatusBar";
import { CFDProvider } from "@/contexts/CFDProvider";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { PosSyncProvider } from "@/contexts/PosSyncProvider";
import { RemoteActionsProvider } from "@/contexts/RemoteActionsProvider";
import { SessionKickListenerProvider } from "@/contexts/SessionKickListenerProvider";
import { TanstackProvider } from "@/contexts/TanstackProvider";
import { ToastProvider } from "@/contexts/ToastContext";
import { NAV_THEME } from "@/lib/constants";
import { initImmer } from "@/lib/initImmer";
import { initLogCollector } from "@/lib/logCollector";
import { logger } from "@/lib/logger";
import { DEADLINES } from "@/lib/network/deadlines";
import { isRefundRecoveryUIEnabled } from "@/lib/network/featureFlags";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
import {
    markNavigationEvent,
    setRootNavigationRef,
} from "@/lib/rootNavigation";
import { POS_SCREEN_OPTIONS } from "@/lib/screenConfig";
import {
    didSecureStorageProbeFail,
    flushAllPendingWrites,
    getEnvReconcileResult,
    secureStorage,
} from "@/lib/storage";
import { initTelemetry } from "@/lib/telemetry/init";
import { colors, setThemeMode, spinnerColor } from "@/lib/theme";
import { UiScaleProvider } from "@/lib/uiScale";
import { useColorScheme } from "@/lib/useColorScheme";
import { getRawIsOnline } from "@/services/offlineSyncService";
import type { PaymentJournalEntry } from "@/services/paymentJournal";
import {
    failPaymentJournal,
    getIncompleteJournals,
    pruneOldJournals,
} from "@/services/paymentJournal";
import { PrinterService } from "@/services/printing/PrinterService";
import {
    getIncompleteRefundJournals,
    pruneOldRefundJournals,
} from "@/services/refundJournal";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import {
    getOrderStoreSupabaseClient,
    useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentRecoveryStore } from "@/stores/usePaymentRecoveryStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { useRefundRecoveryStore } from "@/stores/useRefundRecoveryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Toasts } from "@backpackapp-io/react-native-toast";
import {
    ClerkProvider,
    isClerkRuntimeError,
    TokenCache,
    useAuth,
} from "@clerk/clerk-expo";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
    DarkTheme,
    DefaultTheme,
    Theme,
    ThemeProvider,
} from "@react-navigation/native";
import * as NavigationBar from "expo-navigation-bar";
import { Stack, useNavigationContainerRef } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import * as React from "react";
import {
    ActivityIndicator,
    AppState,
    InteractionManager,
    Platform,
    Pressable,
    Text,
    View,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
// app/_layout.tsx — check for update on launch
import AppUpdateModal from "@/components/AppUpdateModal";
import {
    checkForNativeUpdate,
    type VersionManifest,
} from "@/services/appUpdater";
import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";
import * as Updates from "expo-updates";

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

Sentry.init({
  dsn: "https://dcfdfcd20582347382d2fb94df146b1e@o4511212537380864.ingest.us.sentry.io/4511212539019264",

  // Maps to EAS channel: "development" | "preview" | "production"
  environment: __DEV__ ? "development" : (Updates.channel ?? "unknown"),

  sendDefaultPii: true,
  enableLogs: true,

  // Auto-capture HTTP 4xx/5xx responses as error events
  enableCaptureFailedRequests: true,

  // Offline: cache up to 100 envelopes on disk (default 30)
  maxCacheItems: 100,

  // 100% in dev for debugging, 30% in production to reduce overhead
  tracesSampleRate: __DEV__ ? 1.0 : 0.3,

  // Native crash + hang capture. Android ANRs are captured by the native SDK by
  // default; we additionally enable iOS app-hang tracking and are explicit about
  // native/NDK crash handling so a terminal-driven freeze (e.g. a wedged USB card
  // reader holding the JS/UI thread, as in the S1-0002 refund crash) is reported
  // instead of vanishing as a silent process death.
  enableNativeCrashHandling: true,
  enableNdk: true,
  enableAppHangTracking: true,
  appHangTimeoutInterval: 2,

  integrations: [navigationIntegration],
  enableNativeFramesTracking: !isRunningInExpoGo(),

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Wire structured logger → Sentry breadcrumbs. logger.warn/error calls
// land as breadcrumbs on captured events, helping debug "what was the app
// doing right before this exception?" reports from the field.
logger.onLog = (level, category, message, data) => {
  Sentry.addBreadcrumb({
    category: `app.${category}`,
    level: level === "error" ? "error" : level === "warn" ? "warning" : "info",
    message,
    data,
  });
};

// Catch unhandled JS errors and Promise rejections that bypass React's error
// boundary (e.g. fire-and-forget async calls with no .catch).
// ErrorUtils is a RN global — not a named export. Guard for SSR/test envs.
(global as any).ErrorUtils?.setGlobalHandler?.(
  (error: Error, isFatal?: boolean) => {
    Sentry.captureException(error, {
      tags: { fatal: String(isFatal ?? false), source: "global_handler" },
    });
  },
);

// Report boot-time storage health now that Sentry is live. Both checks run at
// lib/storage.ts import (before Sentry.init), so we surface their results here.
try {
  const envReconcile = getEnvReconcileResult();
  if (envReconcile?.refusedUnknownSignature) {
    // Refused to purge on a malformed env — a near-miss for a fleet-wide logout.
    Sentry.captureMessage("env_guard.refused_purge_unknown_signature", {
      level: "error",
      tags: {
        source: "env_guard",
        from: envReconcile.from ?? "none",
        to: envReconcile.to,
      },
    });
  } else if (envReconcile?.switched) {
    // A real backend switch DID purge — expected once per migration, but worth
    // a breadcrumb so a field logout-storm can be correlated to a signature flip.
    Sentry.captureMessage("env_guard.purged_on_switch", {
      level: "warning",
      tags: {
        source: "env_guard",
        from: envReconcile.from ?? "none",
        to: envReconcile.to,
      },
    });
  } else if (envReconcile) {
    Sentry.addBreadcrumb({
      category: "env_guard",
      level: "info",
      message: "env signature reconciled",
      data: {
        from: envReconcile.from,
        to: envReconcile.to,
        switched: envReconcile.switched,
      },
    });
  }

  if (didSecureStorageProbeFail()) {
    // Encrypted MMKV bucket unreadable this boot → Clerk tokens effectively gone.
    Sentry.captureMessage("secure_storage.decrypt_probe_failed", {
      level: "error",
      tags: { source: "secure_storage" },
    });
  }
} catch {
  // Reporting must never break boot.
}

async function checkForUpdate() {
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // silent restart
    }
  } catch (e) {
    // offline — no problem, skip
  }
}
// IMPORTANT: Must be called once at module level for OAuth to work correctly
WebBrowser.maybeCompleteAuthSession();

// Register CFD secondary display component for Android built-in displays.
// Must happen at module level before native side mounts the ReactRootView.
if (Platform.OS === "android") {
  require("@/components/cfd-builtin/CFDBuiltinDisplay");
}

// Initialize log collector to capture console output for remote log retrieval
initLogCollector();
// Optimize Immer array iteration in producers
initImmer();

/**
 * Coarse bucket for a token-cache key — used only for Sentry tagging so we can
 * tell WHICH kind of token failed to persist without ever logging the token
 * value itself.
 */
function classifyTokenKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("jwt")) return "jwt";
  if (k.includes("client")) return "client";
  if (k.includes("session")) return "session";
  if (k.includes("refresh")) return "refresh";
  return "other";
}

export const tokenCache: TokenCache = {
  async getToken(key: string) {
    try {
      const result = secureStorage.getString(key) ?? null;
      if (__DEV__)
        console.log(`[TokenCache] getToken key="${key}" hit=${!!result}`);
      return result;
    } catch (error) {
      // A THROW here (vs a clean null) means the encrypted bucket couldn't be
      // read for a key that may well be present — distinct from "no token". Tag
      // it so silent token loss is distinguishable from a legitimate logout.
      // Contract: Clerk only accepts a string|null return, so we still return null.
      Sentry.captureException(error, {
        tags: {
          source: "token_cache",
          op: "getToken_read_failed",
          key_kind: classifyTokenKey(key),
        },
      });
      console.error("[TokenCache] getToken error:", error);
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      secureStorage.set(key, value);
      // Read-back verify: an MMKV write that silently doesn't stick means the
      // next refresh reads null and the merchant is logged out with no error.
      // Surface it so field token-loss is observable (never log the value).
      if (secureStorage.getString(key) !== value) {
        Sentry.captureMessage("token_cache.write_verify_failed", {
          level: "error",
          tags: { source: "token_cache", key_kind: classifyTokenKey(key) },
        });
        console.error(
          `[TokenCache] saveToken read-back MISMATCH key="${key}" — token may not persist.`,
        );
      } else if (__DEV__) {
        console.log(`[TokenCache] saveToken key="${key}"`);
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          source: "token_cache",
          op: "saveToken",
          key_kind: classifyTokenKey(key),
        },
      });
      console.error("[TokenCache] saveToken error:", error);
    }
  },
};

const mmkvResourceCache = () => ({
  get: async (key: string) => secureStorage.getString(key) ?? null,
  set: async (key: string, value: string) => {
    secureStorage.set(key, value);
  },
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: NAV_THEME.light,
};
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: NAV_THEME.dark,
};

export {
    // Catch any errors thrown by the Layout component.
    ErrorBoundary
} from "expo-router";

const CLERK_WAS_SIGNED_IN_KEY = "clerk_was_signed_in";
// While ONLINE: generous window for a slow refresh-token round-trip on bad
// restaurant WiFi / cold boot (was a blind 10s, which false-logged-out on slow
// networks). While OFFLINE we never expire into a /login redirect at all.
const GRACE_TIMEOUT_ONLINE_MS = 30_000;
// How often to re-check connectivity while holding an offline session.
const GRACE_OFFLINE_POLL_MS = 3_000;

/**
 * Syncs the authenticated Clerk user + selected station into Sentry so every
 * captured event is tagged with who was logged in and which station sent it.
 * Must be rendered inside <ClerkProvider> (uses useAuth).
 */
function SentryUserSync() {
  const { userId } = useAuth();
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const stationId = selectedStation?.id;
  React.useEffect(() => {
    if (userId) {
      Sentry.setUser({ id: userId });
      Sentry.setTag("station_id", stationId ?? "none");
      Sentry.setTag("station_type", selectedStation?.station_type ?? "unknown");
    } else {
      Sentry.setUser(null);
    }
  }, [userId, stationId, selectedStation?.station_type]);
  return null;
}

/**
 * Gate that replaces the bare <ClerkLoaded>. Prevents the overnight-signout
 * problem by blocking the component tree from rendering during Clerk's token
 * refresh window.
 *
 * When the device wakes from a long sleep, Clerk's JWT is expired. The SDK
 * needs to refresh via the cached refresh token, but this is async. Without
 * this gate, downstream auth checks in index.tsx / (main)/_layout.tsx see
 * isSignedIn=false and immediately redirect to /login before the refresh
 * completes.
 *
 * The gate uses a wasSignedIn flag in MMKV to distinguish "token is refreshing
 * after sleep" from "user was never signed in / explicitly logged out".
 */
function ClerkGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [graceExpired, setGraceExpired] = React.useState(false);
  const graceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Read the persisted flag on each render so explicit sign-out can disable
  // the recovery grace path immediately instead of showing the global loader.
  const wasSignedIn =
    secureStorage.getString(CLERK_WAS_SIGNED_IN_KEY) === "true";

  // Persist the flag when signed in. A successful (re)sign-in also clears any
  // prior in-memory grace expiry, so a LATER wake gets a fresh recovery window
  // and a slow refresh that finally lands rescues the merchant off /login.
  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      secureStorage.set(CLERK_WAS_SIGNED_IN_KEY, "true");
      if (graceExpired) setGraceExpired(false);
    }
  }, [isLoaded, isSignedIn, graceExpired]);

  // Grace period: when Clerk reports signed-out but we were previously signed
  // in, give Clerk time to refresh before routing to /login. Two hard rules:
  //   1. OFFLINE → never expire into /login. The merchant can't sign in offline
  //      anyway, so we hold the cached app indefinitely and keep the flag.
  //   2. ONLINE → force a real refresh and allow expiry only after a generous
  //      window, and NEVER delete the wasSignedIn flag (so a later wake retries).
  const needsGrace = isLoaded && !isSignedIn && wasSignedIn && !graceExpired;

  React.useEffect(() => {
    if (!needsGrace) {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let expiryArmed = false;

    // TRUE forced refresh (skipCache) — do NOT accept a stale/expired cached
    // token. With __experimental_resourceCache set this still returns the cached
    // token OFFLINE instead of throwing, so isSignedIn can flip back true with
    // no network. A network_error is transient and must never end the session.
    const attemptRefresh = () => {
      getToken({ skipCache: true }).catch((err) => {
        if (isClerkRuntimeError(err) && err.code === "network_error") {
          Sentry.addBreadcrumb({
            category: "auth.recovery",
            level: "info",
            message: "ClerkGate refresh hit network_error — holding grace",
          });
        } else {
          Sentry.captureException(err, {
            tags: { source: "clerk_gate", op: "recovery_refresh" },
          });
        }
      });
    };

    const tick = () => {
      if (cancelled) return;

      // OFFLINE: hold the spinner, re-poll, never expire, keep the flag.
      if (!getRawIsOnline()) {
        graceTimerRef.current = setTimeout(tick, GRACE_OFFLINE_POLL_MS);
        return;
      }

      // ONLINE: force a refresh, then arm a one-shot expiry. If the refresh
      // succeeds, isSignedIn flips true and this effect tears down first.
      attemptRefresh();
      if (!expiryArmed) {
        expiryArmed = true;
        graceTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          // Network may have dropped during the window — if so, resume the
          // offline hold rather than bouncing a merchant who's now offline.
          if (!getRawIsOnline()) {
            expiryArmed = false;
            tick();
            return;
          }
          console.warn(
            "[ClerkGate] Online grace expired — treating as a real session end.",
          );
          Sentry.captureMessage("auth.recovery.grace_expired_online", {
            level: "warning",
            tags: { source: "clerk_gate" },
          });
          // Keep CLERK_WAS_SIGNED_IN_KEY: only mark expired in memory (per
          // app-session) so the next wake re-attempts recovery instead of
          // permanently demoting a still-recoverable session.
          setGraceExpired(true);
          graceTimerRef.current = null;
        }, GRACE_TIMEOUT_ONLINE_MS);
      }
    };

    console.log("[ClerkGate] Session refresh grace period started");
    tick();

    return () => {
      cancelled = true;
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, [needsGrace, getToken]);

  // Clerk still loading — show spinner
  if (!isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.screen,
        }}
      >
        <ActivityIndicator size="large" color={spinnerColor} />
      </View>
    );
  }

  // Signed out but was previously signed in — wait for token refresh
  if (needsGrace) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.screen,
        }}
      >
        <ActivityIndicator size="large" color={spinnerColor} />
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * Fallback shown when the root ProductionErrorBoundary catches a render
 * error anywhere in the provider / Stack tree. Offers both an in-place retry
 * (which resets the boundary) and a full app reload via expo-updates, which
 * unsticks corrupted top-level state.
 */
function RootErrorFallback() {
  const handleReload = React.useCallback(() => {
    Updates.reloadAsync().catch((err) => {
      console.error("[RootErrorFallback] reloadAsync failed:", err);
    });
  }, []);
  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Text className="text-2xl font-bold text-destructive mb-2">
        Something went wrong
      </Text>
      <Text className="text-base text-muted-foreground text-center mb-6">
        The app ran into an unexpected problem. Tap below to reload.
      </Text>
      <Pressable
        onPress={handleReload}
        className="bg-primary px-8 py-4 rounded-lg"
      >
        <Text className="text-primary-foreground font-semibold text-lg">
          Reload App
        </Text>
      </Pressable>
    </View>
  );
}

export default Sentry.wrap(function RootLayout() {
  const hasMounted = React.useRef(false);
  const { colorScheme, isDarkColorScheme } = useColorScheme();
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = React.useState(false);
  const isClockInWallOpen = useTimeclockStore((s) => s.isClockInWallOpen);
  const hideClockInWall = useTimeclockStore((s) => s.hideClockInWall);
  const isKDS = useStoreSettingsStore(
    (s) => s.selectedStation?.station_type === "kds",
  );
  const isCFDMode = useStoreSettingsStore((s) => s.isCFDMode);
  const isPOSMode = !isKDS && !isCFDMode;
  const isPinModalOpen = usePinOverrideStore((s) => s.isPinModalOpen);
  const isNoPrinterModalVisible = useNoPrinterModalStore((s) => s.visible);
  const isCustomizationOpen = useCustomizationStore((s) => s.isOpen);
  const [nativeUpdateManifest, setNativeUpdateManifest] =
    React.useState<VersionManifest | null>(null);
  setThemeMode(colorScheme === "light" ? "light" : "dark");

  // Store the navigation container ref for cross-group navigation + Sentry tracing
  const navigationRef = useNavigationContainerRef();
  React.useEffect(() => {
    setRootNavigationRef(navigationRef);
    if (navigationRef?.current) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  // Track navigation events so background services can skip non-critical work
  // (order pruning, toasts) during the brief window after a screen transition.
  React.useEffect(() => {
    const unsubscribe = navigationRef.addListener("state", () => {
      markNavigationEvent();
    });
    return unsubscribe;
  }, [navigationRef]);

  // Hide system UI for full-screen immersive POS experience
  React.useEffect(() => {
    async function runUpdateChecks() {
      if (Platform.OS === "android") {
        NavigationBar.setVisibilityAsync("hidden").catch(() => {});
        const manifest = await checkForNativeUpdate();
        if (manifest) {
          setNativeUpdateManifest(manifest);
          return; // skip OTA — native update takes priority
        }
      }
      checkForUpdate();
    }
    runUpdateChecks();
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (hasMounted.current) {
      return;
    }

    if (Platform.OS === "web") {
      // Adds the background color to the html element to prevent white background on overscroll.
      document.documentElement.classList.add("bg-background");
    }
    setIsColorSchemeLoaded(true);
    hasMounted.current = true;

    // Skip POS-only initialization for KDS stations and CFD client mode
    if (!isKDS && !isCFDMode) {
      // Perf F2: deferred past first paint. This used to run synchronously
      // inside the layout effect and blocked the first frame —
      // cleanupDraftDuplicates iterates ordersById and the journal scans hit
      // MMKV. Nothing here needs to beat the first paint; the payment
      // recovery sheet opening a beat later is fine.
      const bootTask = InteractionManager.runAfterInteractions(() => {
        // NOTE: Timeclock hydration now happens in PosSyncProvider after employees sync.
        // PTO history is calculated from real shift data, not mock data.
        // Start draft order cleanup
        useOrderStore.getState().startDraftCleanup();
        // Start periodic session pruning (cleans stale terminal sessions from memory)
        try {
          const {
            startSessionPrune,
          } = require("@/stores/useTableSessionStore");
          startSessionPrune();
        } catch {
          /* store may not be loaded yet */
        }
        // One-time cleanup: Remove duplicate draft orders (safe to run on every startup)
        useOrderStore.getState().cleanupDraftDuplicates();
        // Start print queue processing
        PrinterService.startProcessing();

        // Wave Cat-B: surface payments that crashed mid-flow (terminal_approved
        // entries from a prior app session). Hydrate the recovery store and
        // auto-open the verifying sheet on the head journal — operator walks
        // through the queue one entry at a time (next entry promotes after
        // markComplete/retryWithNewCharge in usePaymentVerification).
        try {
          pruneOldJournals();
          const incomplete = getIncompleteJournals();
          if (incomplete.length > 0) {
            console.warn(
              `[paymentJournal] ${incomplete.length} incomplete payment journal(s) detected on startup`,
              incomplete.map((j) => ({
                id: j.id,
                status: j.status,
                orderId: j.orderId,
                amount: j.amount,
                createdAt: j.createdAt,
              })),
            );
            // Sentry: track relaunch-recovery rate so we know whether crash
            // recovery is firing in the wild.
            try {
              Sentry.addBreadcrumb({
                category: "payment_recovery",
                level: "warning",
                message: `Relaunch: ${incomplete.length} incomplete journal(s) detected`,
                data: {
                  count: incomplete.length,
                  statuses: incomplete.map((j) => j.status),
                  ages_minutes: incomplete.map((j) =>
                    Math.round(
                      (Date.now() - new Date(j.createdAt).getTime()) / 60_000,
                    ),
                  ),
                },
              });
              Sentry.captureMessage(
                "payment_recovery.relaunch_detected_incomplete",
                {
                  level: "warning",
                  tags: { event: "relaunch_recovery" },
                  extra: {
                    count: incomplete.length,
                    head_status: incomplete[0]?.status,
                  },
                },
              );
            } catch {}
            // Boot pre-check (Wave Cat-B follow-up):
            //
            // For 'terminal_approved' journals — the ones that map to reason=
            // 'crash_recovery' in usePaymentStore.openForVerification — we can
            // ask the server up-front whether a payment row actually landed
            // before the app died. If the server confidently says no
            // (`matched: false`, no error, no timeout), the customer was not
            // charged: silently fail+drop the journal instead of forcing the
            // operator through the 8s "Verifying Payment" overlay.
            //
            // Important asymmetry: 'initiated' journals map to reason=
            // 'tcp_inflight_crash' (the RPC was never reached, so the server
            // CAN'T have a row — check_recent_payment doesn't disambiguate
            // "card charged but RPC never called" from "card not charged").
            // Those still need the operator to look at the terminal display
            // via PaymentTerminalReconciliationModal. Never silently drop them.
            //
            // Anything ambiguous (timeout, network error, matched=true, null
            // result) falls through to the existing overlay — fail-safe.
            //
            // Hydrate moved inside the async block so the recovery queue only
            // carries journals that survived the pre-check; auto-dropped
            // entries shouldn't appear in the "promote next" rotation either.
            queueMicrotask(async () => {
              const supabase = getOrderStoreSupabaseClient();
              const survivors: PaymentJournalEntry[] = [];

              for (const j of incomplete) {
                if (
                  j.status !== "terminal_approved" ||
                  !supabase ||
                  !j.dbOrderId
                ) {
                  survivors.push(j);
                  continue;
                }
                try {
                  const ageSeconds = Math.ceil(
                    (Date.now() - new Date(j.createdAt).getTime()) / 1000,
                  );
                  // Mirror usePaymentVerification.checkOnce: cover the journal
                  // age plus a 5-minute slack so clock skew doesn't move the
                  // server row outside the lookback window.
                  const lookbackSeconds = Math.max(600, ageSeconds + 300);
                  const result = await runWithDeadline<{ matched: boolean }>(
                    "check_recent_payment",
                    DEADLINES.paymentAuthCheck,
                    async (signal) => {
                      const { data, error } = await supabase
                        .rpc("check_recent_payment", {
                          p_order_id: j.dbOrderId,
                          p_lookback_seconds: lookbackSeconds,
                          p_amount_cents: Math.round(j.amount * 100),
                          p_split_portion_index: null,
                        })
                        .abortSignal(signal);
                      return {
                        data: data as { matched: boolean } | null,
                        error,
                      };
                    },
                  );
                  if (
                    result?.data &&
                    result.data.matched === false &&
                    !result.error
                  ) {
                    failPaymentJournal(j.id, "boot_precheck_no_server_row");
                    try {
                      Sentry.addBreadcrumb({
                        category: "payment_recovery",
                        level: "info",
                        message: "payment_recovery.boot_precheck_dropped",
                        data: {
                          journal_id: j.id,
                          order_db_id: j.dbOrderId,
                          amount_cents: Math.round(j.amount * 100),
                          age_seconds: ageSeconds,
                        },
                      });
                    } catch {}
                    continue;
                  }
                } catch {
                  // Network error / unexpected throw — fall back to overlay.
                }
                survivors.push(j);
              }

              if (survivors.length === 0) return;
              usePaymentRecoveryStore.getState().hydrate(survivors);
              usePaymentStore.getState().openForVerification(survivors[0]);
            });
          }
        } catch (err) {
          console.error("[paymentJournal] Recovery hydration failed:", err);
        }

        // Wave R-3: surface refunds that crashed mid-flow (terminal_approved
        // entries from a prior app session). Hydrate the refund recovery store.
        // UI is gated by isRefundRecoveryUIEnabled() — disabled by default until
        // the feature flag is set in production.
        try {
          pruneOldRefundJournals();
          const incompleteRefunds = getIncompleteRefundJournals();
          if (incompleteRefunds.length > 0 && isRefundRecoveryUIEnabled()) {
            console.warn(
              `[refundJournal] ${incompleteRefunds.length} incomplete refund journal(s) detected on startup`,
              incompleteRefunds.map((j) => ({
                id: j.id,
                status: j.status,
                orderId: j.orderId,
                amount: j.amount,
                createdAt: j.createdAt,
              })),
            );
            // Sentry site 2: track relaunch-recovery rate for refunds.
            try {
              Sentry.addBreadcrumb({
                category: "refund_recovery",
                level: "warning",
                message: `Relaunch: ${incompleteRefunds.length} incomplete refund journal(s) detected`,
                data: {
                  count: incompleteRefunds.length,
                  statuses: incompleteRefunds.map((j) => j.status),
                  ages_minutes: incompleteRefunds.map((j) =>
                    Math.round(
                      (Date.now() - new Date(j.createdAt).getTime()) / 60_000,
                    ),
                  ),
                },
              });
              Sentry.captureMessage(
                "refund_recovery.relaunch_detected_incomplete",
                {
                  level: "warning",
                  tags: { event: "relaunch_recovery" },
                  extra: {
                    count: incompleteRefunds.length,
                    head_status: incompleteRefunds[0]?.status,
                  },
                },
              );
            } catch {}
            useRefundRecoveryStore.getState().hydrate(incompleteRefunds);
          }
        } catch (err) {
          console.error("[refundJournal] Recovery hydration failed:", err);
        }
      });
      return () => bootTask.cancel();
    }
  }, []);

  // Flush pending MMKV writes when app goes to background to prevent data loss
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        flushAllPendingWrites();
      }
    });
    return () => sub.remove();
  }, []);

  // Wave-0 perf telemetry (long-task watcher, persist/broadcast counters,
  // ring buffer). Owns its own AppState listener + 30s flush; idempotent.
  React.useEffect(() => {
    initTelemetry();
  }, []);

  // Cleanup intervals on unmount
  React.useEffect(() => {
    return () => {
      if (!isKDS && !isCFDMode) {
        useOrderStore.getState().stopDraftCleanup();
        PrinterService.stopProcessing();
      }
    };
  }, [isKDS, isCFDMode]);

  // Also stop draft cleanup when app goes to background (prevents background timer leaks)
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        if (!isKDS && !isCFDMode) {
          useOrderStore.getState().stopDraftCleanup();
          PrinterService.stopProcessing();
          try {
            const {
              stopSessionPrune,
            } = require("@/stores/useTableSessionStore");
            stopSessionPrune();
          } catch {
            /* store may not be loaded */
          }
        }
      } else if (state === "active") {
        // Restart when app comes back to foreground
        if (!isKDS && !isCFDMode) {
          useOrderStore.getState().startDraftCleanup();
          PrinterService.startProcessing();
          try {
            const {
              startSessionPrune,
            } = require("@/stores/useTableSessionStore");
            startSessionPrune();
          } catch {
            /* store may not be loaded */
          }
        }
      }
    });
    return () => sub.remove();
  }, [isKDS, isCFDMode]);

  if (!isColorSchemeLoaded) {
    return null;
  }

  if (!publishableKey) {
    return (
      <View className="flex-1 items-center justify-center bg-red-100">
        <Text className="text-red-600 text-lg font-semibold">
          Missing Clerk Publishable Key
        </Text>
        <Text className="text-red-500 text-sm mt-2">
          Please add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file
        </Text>
      </View>
    );
  }

  if (__DEV__) {
    console.log("Clerk Key:", publishableKey?.substring(0, 20));
    console.log("TokenCache:", typeof tokenCache);
  }

  return (
    <PortalProvider>
      <ClerkProvider
        publishableKey={publishableKey}
        tokenCache={tokenCache}
        __experimental_resourceCache={mmkvResourceCache}
      >
        <ClerkGate>
          {/* <ClerkSessionDebugger /> */}
          <ClerkSessionKeeper />
          <SentryUserSync />
          <ProductionErrorBoundary
            section="RootLayout"
            fallback={<RootErrorFallback />}
          >
            <TanstackProvider>
              <PosSyncProvider>
                <GestureHandlerRootView>
                  <UiScaleProvider>
                    <SafeAreaProvider>
                      <ThemeProvider
                        key={colorScheme}
                        value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}
                      >
                        <BottomSheetModalProvider>
                          <ToastProvider>
                            <LoadingProvider>
                              <SessionKickListenerProvider>
                                <RemoteActionsProvider>
                                  <CFDProvider>
                                    <StatusBar
                                      style={"dark"}
                                      translucent
                                      hidden={Platform.OS === "android"}
                                    />
                                    {Platform.OS === "android" && (
                                      <SystemBars
                                        hidden={{
                                          navigationBar: true,
                                          statusBar: true,
                                        }}
                                      />
                                    )}
                                    <Stack
                                      screenOptions={{
                                        ...POS_SCREEN_OPTIONS,
                                        contentStyle: {
                                          backgroundColor: colors.screen,
                                        },
                                      }}
                                    >
                                      <Stack.Screen name="index" />
                                      <Stack.Screen name="(auth)" />
                                      <Stack.Screen name="(cfd)" />
                                      <Stack.Screen name="(main)" />
                                      <Stack.Screen name="(profiles-and-timeclock)" />
                                    </Stack>
                                    <PortalHost />
                                    {isPOSMode && <SearchBottomSheet />}
                                    {isPOSMode && isCustomizationOpen && (
                                      <ItemCustomizationDialog />
                                    )}
                                    {isPOSMode && isClockInWallOpen && (
                                      <ClockInWallModal
                                        isOpen={isClockInWallOpen}
                                        onClose={hideClockInWall}
                                      />
                                    )}
                                    {isPOSMode && isPinModalOpen && (
                                      <ManagerPinModal />
                                    )}
                                    {isPOSMode && <CustomerSheet />}
                                    {isPOSMode && isNoPrinterModalVisible && (
                                      <NoPrinterModal />
                                    )}
                                    {nativeUpdateManifest && (
                                      <AppUpdateModal
                                        visible={true}
                                        manifest={nativeUpdateManifest}
                                        onSkip={() =>
                                          setNativeUpdateManifest(null)
                                        }
                                        onInstallComplete={() =>
                                          setNativeUpdateManifest(null)
                                        }
                                      />
                                    )}
                                    <Toasts
                                      defaultStyle={{
                                        view: {
                                          backgroundColor: colors.card,
                                          borderWidth: 1,
                                          borderColor: colors.border,
                                          flex: 1,
                                        },
                                        text: {
                                          color: colors.heading,
                                          fontWeight: "bold",
                                          fontSize: 24,
                                        },
                                        indicator: {
                                          backgroundColor: colors.teal,
                                        },
                                      }}
                                    />
                                  </CFDProvider>
                                </RemoteActionsProvider>
                              </SessionKickListenerProvider>
                            </LoadingProvider>
                          </ToastProvider>
                        </BottomSheetModalProvider>
                      </ThemeProvider>
                    </SafeAreaProvider>
                  </UiScaleProvider>
                </GestureHandlerRootView>
              </PosSyncProvider>
            </TanstackProvider>
          </ProductionErrorBoundary>
        </ClerkGate>
      </ClerkProvider>
    </PortalProvider>
  );
});

const useIsomorphicLayoutEffect =
  Platform.OS === "web" && typeof window === "undefined"
    ? React.useEffect
    : React.useLayoutEffect;
