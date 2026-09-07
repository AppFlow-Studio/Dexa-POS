// components/cfd-client/CFDScreenRouter.tsx
// Shared screen-state router used by both external CFD tablets and built-in secondary displays.
import {
  CFDDisplayDataContext,
  useCFDDisplayData,
} from "@/contexts/CFDDisplayDataContext.base";
import {
  triggerCFDLoyaltyJoin,
  triggerCFDLoyaltySkip,
  triggerCFDPhoneSubmit,
} from "@/lib/cfdLoyaltyTriggers";
import { colors } from "@/lib/theme";
import { CFDScaleProvider, useUiScale } from "@/lib/uiScale";
import { useContext, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { iosOnly } from "@/lib/safeAnimations";
import { Platform } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { IdleScreen } from "./IdleScreen";
import { LoyaltyConfirmationScreen } from "./LoyaltyConfirmationScreen";
import { LoyaltyPromptScreen } from "./LoyaltyPromptScreen";
import { OrderingScreen } from "./OrderingScreen";
import { PaymentScreen } from "./PaymentScreen";
import { ResultScreen } from "./ResultScreen";
import { TipSelectionScreen } from "./TipSelectionScreen";

interface Props {
  onTipSelected?: (tipAmount: number, tipPercentage: number | null) => void;
  onPhoneSubmitted?: (phone: string) => void;
  onLoyaltySkip?: () => void;
  onLoyaltyJoin?: () => void;
  /**
   * When true (WebView path), the loyalty phone keypad is rendered
   * natively outside the WebView (by CFDBuiltinDisplay). The WebView's
   * CFDScreenRouter skips its own LoyaltyPromptScreen layer entirely.
   */
  nativeLoyaltyPrompt?: boolean;
}

/**
 * Publishes the operator's CFD-only scale override (Settings > Customer
 * Display) to the whole CFD screen tree before anything inside it measures.
 *
 * Every CFD screen already calls `useUiScale()`, and that hook consults this
 * context — so the override reaches all of them without touching a single
 * screen component. It has to sit *outside* CFDScreenRouterInner because the
 * router scales its own styles too.
 *
 * The override is read from display data rather than settings directly: the
 * external CFD tablet and the WebView bundle have no access to the POS's
 * MMKV, so the value arrives over the payload.
 */
export function CFDScreenRouter(props: Props) {
  // Read the context directly rather than via useCFDDisplayData(), which
  // throws when no provider is mounted (an unmount race would surface as an
  // Android system crash dialog here). A missing provider just means no
  // override — fall back to the automatic scale.
  const displayData = useContext(CFDDisplayDataContext);
  return (
    <CFDScaleProvider override={displayData?.cfdUiScaleOverride ?? null}>
      <CFDScreenRouterInner {...props} />
    </CFDScaleProvider>
  );
}

function CFDScreenRouterInner({
  onTipSelected,
  onPhoneSubmitted,
  onLoyaltySkip,
  onLoyaltyJoin,
  nativeLoyaltyPrompt = false,
}: Props) {
  const uiScale = useUiScale();
  const styles = useMemo(() => getStylesForScale(uiScale), [uiScale]);

  // Defensive: if context is missing (e.g. during unmount race), fall back
  // to idle rather than letting the throw escape to the native Presentation
  // layer where it surfaces as an Android system crash dialog.
  let screenState: ReturnType<typeof useCFDDisplayData>["screenState"] = "idle";
  let items: ReturnType<typeof useCFDDisplayData>["items"] = [];
  let loyaltyProgramCount = 0;
  let loyaltyCustomerName: string | null = null;
  let customerName: string | null = null;
  let customerPhone: string | null = null;
  try {
    const data = useCFDDisplayData();
    screenState = data.screenState;
    items = data.items;
    loyaltyProgramCount = data.loyaltyResult?.programs?.length ?? 0;
    loyaltyCustomerName = data.loyaltyResult?.customerName ?? null;
    customerName = data.customerName ?? null;
    customerPhone = data.customerPhone ?? null;
  } catch {
    // Context not available — render idle (dark screen, invisible to customer)
  }

  const hasLoyaltyCustomerContext =
    !!loyaltyCustomerName || !!customerName || !!customerPhone;

  const handleLoyaltyJoin = () => {
    if (onLoyaltyJoin) {
      onLoyaltyJoin();
      return;
    }
    // Built-in fallback: use the provider's real loyalty flow (auto-earn when possible).
    triggerCFDLoyaltyJoin();
  };

  const resolvedState = (() => {
    switch (screenState) {
      case "idle":
      case "ordering":
      case "tip_selection":
      case "payment":
      case "processing":
      case "approved":
      case "declined":
      case "loyalty_prompt":
      case "loyalty_confirmation":
        return screenState;
      default:
        return items.length > 0 ? "ordering" : "idle";
    }
  })();

  // Keep payment -> processing on the same mounted screen to avoid a visible flash.
  const transitionKey =
    resolvedState === "payment" || resolvedState === "processing"
      ? "payment-flow"
      : resolvedState;

  const prevResolvedStateRef = useRef<string>("init");
  useEffect(() => {
    if (prevResolvedStateRef.current === resolvedState) return;
    // Unconditional perf log — pairs with cfd-entry.tsx's
    // `[CFDWebView] handleLoyaltyJoin: setScreenState=…ms` line so we
    // can measure the gap between optimistic flip and CFDScreenRouter
    // observing the new state. Small gap (<30ms) → render path is
    // clean and any remaining perceived lag is below the JS layer
    // (WebView compositor). Large gap → render bottleneck to chase.
    const t =
      typeof performance !== "undefined"
        ? performance.now().toFixed(0)
        : String(Date.now());
    console.log(
      `[CFD Router] resolvedState=${resolvedState} from=${prevResolvedStateRef.current} at ${t}ms`,
    );
    if (__DEV__) {
      console.log("[CFD Router Trace] state-transition", {
        from: prevResolvedStateRef.current,
        to: resolvedState,
        rawScreenState: screenState,
        itemCount: items.length,
        loyaltyProgramCount,
        hasLoyaltyCustomer: hasLoyaltyCustomerContext,
        hasLoyaltyResultCustomer: !!loyaltyCustomerName,
      });
    }
    prevResolvedStateRef.current = resolvedState;
  }, [
    resolvedState,
    screenState,
    items.length,
    loyaltyProgramCount,
    loyaltyCustomerName,
    customerName,
    customerPhone,
    hasLoyaltyCustomerContext,
  ]);

  // Renders the *non-loyalty* rotating screens. LoyaltyPromptScreen is
  // permanently mounted in a separate stack layer (see the JSX below) so
  // its first-mount cost doesn't block the Approved → keypad transition.
  const renderRotatingScreen = () => {
    try {
      switch (resolvedState) {
        case "idle":
          return <IdleScreen />;
        case "ordering":
          return <OrderingScreen />;
        case "tip_selection":
          return (
            <TipSelectionScreen onTipSelected={onTipSelected ?? (() => {})} />
          );
        case "payment":
          return <PaymentScreen />;
        case "processing":
          return <PaymentScreen processing />;
        case "approved":
          return (
            <ResultScreen
              success
              onJoinLoyalty={handleLoyaltyJoin}
              onSkip={onLoyaltySkip ?? triggerCFDLoyaltySkip}
            />
          );
        case "declined":
          return <ResultScreen success={false} />;
        case "loyalty_prompt":
          // Handled by the always-mounted layer below — render nothing here.
          return null;
        case "loyalty_confirmation":
          return <LoyaltyConfirmationScreen />;
        default:
          return <IdleScreen />;
      }
    } catch (err) {
      console.error(
        "[CFDScreenRouter] Render error, falling back to idle:",
        err,
      );
      return <IdleScreen />;
    }
  };

  const isLoyaltyPrompt = resolvedState === "loyalty_prompt";
  const skipWebViewLoyaltyPrompt = isLoyaltyPrompt && nativeLoyaltyPrompt;

  // The `key` is the trigger that makes Reanimated's entering/exiting layout
  // animations replay on screen change. On web/Android those animations are
  // stripped (see `iosOnly`), so the key change only causes a wasted unmount
  // + remount of the entire screen subtree — major culprit for sluggish
  // screen transitions on the WebView CFD. Only set the key on iOS where the
  // fade actually plays.
  const animatedKey = Platform.OS === "ios" ? transitionKey : undefined;

  return (
    <Animated.View
      key={animatedKey}
      entering={iosOnly(FadeIn.duration(260))}
      exiting={iosOnly(FadeOut.duration(180))}
      style={styles.container}
    >
      <View style={styles.screenContent}>
        {/* Rotating layer — Idle / Ordering / Result / etc. */}
        <View
          style={[
            styles.layer,
            isLoyaltyPrompt && !skipWebViewLoyaltyPrompt && styles.layerHidden,
          ]}
        >
          {renderRotatingScreen()}
        </View>

        {/* Loyalty-prompt layer — ALWAYS MOUNTED (except in WebView
            mode where nativeLoyaltyPrompt=true). The keypad's 12
            TouchableOpacity nodes + StyleSheet.create + ScrollView
            ancestors are notoriously slow to spin up on Android
            WebView's V8 (~150-400ms cold). Pre-mounting eliminates
            that cost: every transition into loyalty_prompt is now
            just a `display: 'flex'` toggle. The component receives
            `visible` so it can reset its phoneDigits state when it
            goes hidden, so a returning customer always sees an empty
            input.

            When nativeLoyaltyPrompt=true (WebView path), this layer
            is skipped entirely because the native overlay handles
            phone entry. */}
        {!skipWebViewLoyaltyPrompt && (
          <View
            style={[
              styles.layer,
              !isLoyaltyPrompt &&
                !skipWebViewLoyaltyPrompt &&
                styles.layerHidden,
            ]}
          >
            <LoyaltyPromptScreen
              visible={isLoyaltyPrompt}
              onPhoneSubmitted={onPhoneSubmitted ?? triggerCFDPhoneSubmit}
              onSkip={onLoyaltySkip ?? triggerCFDLoyaltySkip}
            />
          </View>
        )}
      </View>
      {resolvedState !== "idle" ? (
        <View pointerEvents="none" style={styles.dexaFooterWrap}>
          <Text style={styles.dexaFooterText}>Powered by DEXA</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const createStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale);
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    screenContent: {
      flex: 1,
      position: "relative",
    },
    // Both rotating + loyalty-prompt layers absolutely fill the
    // screenContent. Toggling display swaps them without remounting.
    layer: {
      ...StyleSheet.absoluteFillObject,
    },
    layerHidden: {
      display: "none",
    },
    dexaFooterWrap: {
      minHeight: s(20),
      alignItems: "center",
      justifyContent: "center",
      paddingTop: s(2),
      paddingBottom: s(6),
    },
    dexaFooterText: {
      fontSize: s(10),
      lineHeight: s(14),
      fontWeight: "500",
      color: colors.label,
      letterSpacing: 0.25,
      opacity: 0.82,
    },
  });
};

const stylesByScale = new Map<number, ReturnType<typeof createStyles>>();
const getStylesForScale = (scale: number) => {
  const cached = stylesByScale.get(scale);
  if (cached) return cached;
  const next = createStyles(scale);
  stylesByScale.set(scale, next);
  return next;
};
