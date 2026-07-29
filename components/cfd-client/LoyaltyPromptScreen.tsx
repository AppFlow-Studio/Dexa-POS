// components/cfd-client/LoyaltyPromptScreen.tsx
import { useCFDDisplayField } from "@/contexts/CFDDisplayDataContext.base";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { Delete, Gift } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RawClickButton } from "./RawClickButton";

interface Props {
  onPhoneSubmitted: (phone: string) => void;
  onSkip: () => void;
  /**
   * Whether this screen is currently visible to the customer. The screen
   * is permanently mounted by CFDScreenRouter (display: none toggle)
   * so first-mount cost doesn't block the Approved → keypad transition.
   * `visible` lets us reset phoneDigits + isSubmitting between sessions
   * so a returning customer always starts with an empty input.
   */
  visible?: boolean;
}

const PHONE_DIGITS = 10;

function formatEnteredPhone(digits: string): string {
  const d = digits.slice(0, PHONE_DIGITS);
  if (d.length === 0) return "Enter number";
  return d;
}

// ---------------------------------------------------------------------------
// StyleSheet — defined OUTSIDE the component so the object reference is
// permanently stable. Previously it lived inside a useMemo keyed on
// themeMode, which meant every theme change (or anything that caused the
// memo to re-evaluate) produced a new `styles` object, invalidating
// React.memo on Keypad and forcing a full subtree re-render mid-input.
//
// If you need true per-theme stylesheets, keep two static objects here
// (lightStyles / darkStyles) and select between them in the render path
// with a ternary — the reference per theme stays stable that way too.
// ---------------------------------------------------------------------------
// StyleSheet keyed by scale (see getStylesForScale below) — the object
// reference stays stable across re-renders at the same scale, preserving
// the React.memo behavior on Keypad/KeyButton described above.
const createStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.screen,
    },
    body: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: s(8),
      paddingHorizontal: s(24),
      paddingTop: s(14),
      paddingBottom: s(6),
    },
    iconCircle: {
      width: s(40),
      height: s(40),
      borderRadius: s(20),
      backgroundColor: colors.tealMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    headline: {
      fontSize: s(22),
      fontWeight: "700",
      color: colors.heading,
      textAlign: "center",
      letterSpacing: -0.2,
    },
    phoneCard: {
      width: s(300),
      backgroundColor: colors.screen,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: s(12),
      paddingVertical: s(6),
      paddingHorizontal: s(12),
      alignItems: "center",
    },
    phoneText: {
      fontSize: s(24),
      fontWeight: "600",
      color: colors.heading,
      letterSpacing: 0.5,
    },
    keypad: {
      width: s(300),
      gap: s(4),
    },
    numpadRow: {
      flexDirection: "row",
      gap: s(4),
    },
    numKey: {
      flex: 1,
      height: s(42),
      alignItems: "center",
      justifyContent: "center",
    },
    numKeyAction: {
      backgroundColor: colors.screen,
    },
    numKeyText: {
      fontSize: s(18),
      fontWeight: "700",
      color: colors.heading,
    },
    numKeySmall: {
      fontSize: s(12),
      fontWeight: "700",
      color: colors.label,
    },
    footerInner: {
      flexDirection: "row",
      gap: s(10),
      width: s(300),
      marginTop: s(12),
    },
    skipBtn: {
      flex: 1,
      minHeight: s(40),
      borderRadius: s(10),
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    skipBtnText: {
      fontSize: s(14),
      fontWeight: "600",
      color: colors.label,
    },
    continueBtn: {
      flex: 1,
      minHeight: s(40),
      borderRadius: s(10),
      backgroundColor: colors.teal,
      alignItems: "center",
      justifyContent: "center",
    },
    continueBtnDisabled: {
      opacity: 0.42,
    },
    continueBtnText: {
      fontSize: s(14),
      fontWeight: "700",
      color: colors.onSolid,
    },
    submittingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: s(24),
    },
    submittingCard: {
      width: "100%",
      maxWidth: s(360),
      backgroundColor: colors.panel,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: s(16),
      paddingVertical: s(28),
      paddingHorizontal: s(24),
      alignItems: "center",
      gap: s(14),
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: s(18),
      shadowOffset: { width: 0, height: s(6) },
      elevation: 6,
    },
    submittingText: {
      fontSize: s(18),
      fontWeight: "700",
      color: colors.heading,
      letterSpacing: 0.2,
      textAlign: "center",
    },
    submittingSubtext: {
      fontSize: s(13),
      fontWeight: "500",
      color: colors.label,
      textAlign: "center",
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

type LoyaltyPromptStyles = ReturnType<typeof createStyles>;

// ---------------------------------------------------------------------------
// Keypad
//
// Custom keypad implementation — bypasses the TouchableOpacity wrapper
// entirely.
//
// Why: TouchableOpacity's per-key event handling on Android WebView was
// causing "press 3 then 4 → 33" — the second tap's `touchstart` was
// occasionally being interpreted as a `touchmove` continuation of the
// first touch, so the second key never fired and the customer perceived
// a duplicate of the first digit. Switching to RawClickButton (compiles
// to a plain <div role="button"> with native click handling on web)
// sidesteps the flaky TouchableOpacity/PressResponder combo.
//
// Each key is its own memoized component with a stable, per-key onPress
// closure. With React.memo + the parent passing a stable `onPress`
// callback (via useCallback with [] deps), the buttons never re-render
// after first mount.
// ---------------------------------------------------------------------------

interface KeyButtonProps {
  label: string | null;
  digit: string;
  isAction?: boolean;
  iconSlot?: React.ReactNode;
  onPress: (key: string) => void;
  styles: LoyaltyPromptStyles;
}

const KeyButton = memo(function KeyButton({
  label,
  digit,
  isAction = false,
  iconSlot,
  onPress,
  styles,
}: KeyButtonProps) {
  const handlePress = useCallback(() => {
    const t0 = performance.now();
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Keypad] press digit=${digit}`);
      const t1 = performance.now();
      if (t1 - t0 > 8)
        console.warn(`[Keypad] handleKey took ${(t1 - t0).toFixed(1)}ms`);
    }
    onPress(digit);
  }, [digit, onPress]);

  return (
    <RawClickButton
      onPress={handlePress}
      style={isAction ? [styles.numKey, styles.numKeyAction] : styles.numKey}
      accessibilityLabel={label ?? digit}
    >
      {iconSlot ?? (
        <Text style={isAction ? styles.numKeySmall : styles.numKeyText}>
          {label}
        </Text>
      )}
    </RawClickButton>
  );
});

interface KeypadProps {
  onPress: (key: string) => void;
  styles: LoyaltyPromptStyles;
  uiScale: number;
}

// Keypad no longer receives `styles` as a prop — it references the module-
// level constant directly. This removes the last prop that could change
// between renders and keeps React.memo's shallow-equal check trivially fast.
const Keypad = memo(function Keypad({ onPress, styles, uiScale }: KeypadProps) {
  return (
    <View style={styles.keypad}>
      {[
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
      ].map((row, ri) => (
        <View key={ri} style={styles.numpadRow}>
          {row.map((key) => (
            <KeyButton
              key={key}
              label={key}
              digit={key}
              onPress={onPress}
              styles={styles}
            />
          ))}
        </View>
      ))}
      <View style={styles.numpadRow}>
        <KeyButton
          label="clear"
          digit="clear"
          isAction
          onPress={onPress}
          styles={styles}
        />
        <KeyButton label="0" digit="0" onPress={onPress} styles={styles} />
        <KeyButton
          label={null}
          digit="backspace"
          isAction
          onPress={onPress}
          iconSlot={<Delete size={Math.round(16 * uiScale)} color={colors.heading} />}
          styles={styles}
        />
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// LoyaltyPromptScreen
// ---------------------------------------------------------------------------

export function LoyaltyPromptScreen({
  onPhoneSubmitted,
  onSkip,
  visible = true,
}: Props) {
  // Only subscribe to themeMode so unrelated host pushes don't re-render
  // the keypad mid-input. We no longer use themeMode to rebuild styles
  // (the stylesheet is static above), but we keep the subscription so the
  // component re-renders and picks up the new `colors` values if the theme
  // actually changes while the screen is visible.
  const themeMode = useCFDDisplayField("themeMode");
  const uiScale = useUiScale();
  const styles = useMemo(() => getStylesForScale(uiScale), [themeMode, uiScale]);

  // ---------------------------------------------------------------------------
  // Phone digits — stored in a ref to avoid triggering a React render on
  // every keystroke. The only two things that actually need to re-render on
  // input are:
  //   1. The phone display Text node  → updated via setNativeProps (no React)
  //   2. The Continue button enabled state → a single boolean useState
  //
  // This cuts the per-keystroke render work from "full subtree diff" down to
  // "one tiny boolean comparison on two leaf nodes".
  // ---------------------------------------------------------------------------
  const phoneDigitsRef = useRef("");
  const phoneDisplayRef = useRef<Text>(null);
  const submitStartedRef = useRef(false);

  const [phoneDisplay, setPhoneDisplay] = useState(formatEnteredPhone(""));
  const [canSubmit, setCanSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Diagnostic timeout only. The host owns the transition to confirmation or
  // fallback; clearing locally invites duplicate submits while lookup is still
  // in flight.
  useEffect(() => {
    if (!isSubmitting) return;
    const t = setTimeout(() => {
      console.warn("[LoyaltyPromptScreen] phone lookup still pending after 45s");
    }, 45_000);
    return () => clearTimeout(t);
  }, [isSubmitting]);

  // Reset when the screen goes hidden (permanently-mounted component).
  useEffect(() => {
    if (!visible) {
      phoneDigitsRef.current = "";
      // setNativeProps works on native RN but NOT on react-native-web
      // (DOM elements don't have this method). Wrap in try-catch so the
      // WebView path doesn't crash on mount.
      try {
        phoneDisplayRef.current?.setNativeProps({
          text: formatEnteredPhone(""),
        });
      } catch {}
      setPhoneDisplay(formatEnteredPhone(""));
      setCanSubmit(false);
      submitStartedRef.current = false;
      setIsSubmitting(false);
    }
  }, [visible]);

  // Stable callback — [] deps so Keypad's memo is never invalidated.
  const handleKey = useCallback((key: string) => {
    const prev = phoneDigitsRef.current;

    let next: string;
    if (key === "backspace") {
      next = prev.slice(0, -1);
    } else if (key === "clear") {
      next = "";
    } else if (prev.length < PHONE_DIGITS) {
      next = prev + key;
    } else {
      return; // already full, no-op
    }

    phoneDigitsRef.current = next;

    // Update the display text directly on the native Text node — zero React
    // render cycle cost. The bridge call is a single tiny synchronous write
    // rather than a full VDOM diff + serialized patch.
    // On react-native-web (WebView path), setNativeProps is not a function
    // on DOM elements, so we try-catch the call.
    try {
      phoneDisplayRef.current?.setNativeProps({
        text: formatEnteredPhone(next),
      });
    } catch {}
    setPhoneDisplay(formatEnteredPhone(next));

    // Only trigger a React re-render on native (not web) when submit-ability flips.
    // On web we already trigger a re-render via the fallback approach, so this
    // is just an optimization for native.
    const nowFull = next.length === PHONE_DIGITS;
    if (nowFull !== (prev.length === PHONE_DIGITS)) {
      setCanSubmit(nowFull);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (submitStartedRef.current) return;
    if (phoneDigitsRef.current.length === PHONE_DIGITS) {
      submitStartedRef.current = true;
      setIsSubmitting(true);
      onPhoneSubmitted(phoneDigitsRef.current);
    }
  }, [onPhoneSubmitted]);

  const handleSkipPress = useCallback(() => {
    if (submitStartedRef.current) return;
    submitStartedRef.current = true;
    setIsSubmitting(true);
    onSkip();
  }, [onSkip]);

  return (
    <View style={styles.container}>
      {/* Body — plain View instead of ScrollView. Compact layout fits
          the CFD viewport without scrolling, and dropping ScrollView
          shaves a non-trivial first-mount cost on the WebView. */}
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Gift size={Math.round(24 * uiScale)} color={colors.teal} strokeWidth={2.2} />
        </View>

        <Text style={styles.headline}>Enter your phone number</Text>

        <View style={styles.phoneCard}>
          {/* ref used for setNativeProps — bypasses React render on input */}
          <Text ref={phoneDisplayRef} style={styles.phoneText}>
            {phoneDisplay}
          </Text>
        </View>

        {/* Keypad only receives a stable callback — never re-renders after
            first mount thanks to React.memo + [] deps on handleKey. */}
        <Keypad onPress={handleKey} styles={styles} uiScale={uiScale} />

        <View style={styles.footerInner}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSkipPress}
            style={styles.skipBtn}
            disabled={isSubmitting}
          >
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            style={[
              styles.continueBtn,
              (!canSubmit || isSubmitting) && styles.continueBtnDisabled,
            ]}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Optimistic submission overlay — shows immediately on Continue
          while the host runs the auto-earn lookup. */}
      {isSubmitting && (
        <View pointerEvents="auto" style={styles.submittingOverlay}>
          <View style={styles.submittingCard}>
            <ActivityIndicator size="large" color={colors.teal} />
            <Text style={styles.submittingText}>Looking up your rewards…</Text>
            <Text style={styles.submittingSubtext}>
              This will only take a moment.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
