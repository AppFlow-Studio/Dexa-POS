// components/cfd-builtin/NativeLoyaltyPromptScreen.tsx
//
// Native-only phone-entry keypad for the built-in secondary display.
// Renders OUTSIDE the WebView (on the Hermes React root) so the keypad
// buttons use native TouchableOpacity touch handling — not V8's
// corrupted touch events inside the WebView.
//
// Differences from the shared LoyaltyPromptScreen:
//   - Uses React state (useState) for phoneDigits, NOT setNativeProps
//     (setNativeProps was removed in RN 0.76+).
//   - Uses plain TouchableOpacity for every key — no RawClickButton,
//     no React.memo gymnastics. The native Presentation window has a
//     tiny React tree; re-render cost is negligible.
//   - No `visible` prop — this component is conditionally rendered
//     (mounted/unmounted) by CFDBuiltinDisplay.

import { useCFDDisplayField } from "@/contexts/CFDDisplayDataContext.base";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { Delete, Gift } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";

interface Props {
  onPhoneSubmitted: (phone: string) => void;
  onSkip: () => void;
}

const PHONE_DIGITS = 10;

function formatUSPhone(digits: string): string {
  const d = digits.slice(0, PHONE_DIGITS);
  if (d.length === 0) return "Enter number";
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const keyRows = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const;

export function NativeLoyaltyPromptScreen({ onPhoneSubmitted, onSkip }: Props) {
  // Subscribe to themeMode so we pick up the correct colors
  // (the theme might change while the prompt is showing).
  const themeMode = useCFDDisplayField("themeMode");
  const { width, height } = useWindowDimensions();
  const uiScale = useUiScale();

  const [phoneDigits, setPhoneDigits] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitStartedRef = useRef(false);

  const canSubmit = phoneDigits.length === PHONE_DIGITS;

  // Diagnostic timeout only. The host owns the transition to confirmation or
  // fallback; clearing locally invites duplicate submits while lookup is still
  // in flight.
  useEffect(() => {
    if (!isSubmitting) return;
    const t = setTimeout(() => {
      console.warn("[NativeLoyaltyPromptScreen] phone lookup still pending after 45s");
    }, 45_000);
    return () => clearTimeout(t);
  }, [isSubmitting]);

  // Stable callback — [] deps so it never needs to be recreated.
  const handleKeyPress = useCallback((key: string) => {
    setPhoneDigits((prev) => {
      if (key === "backspace") return prev.slice(0, -1);
      if (key === "clear") return "";
      if (prev.length < PHONE_DIGITS) return prev + key;
      return prev;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (submitStartedRef.current) return;
    if (phoneDigits.length === PHONE_DIGITS) {
      submitStartedRef.current = true;
      setIsSubmitting(true);
      onPhoneSubmitted(phoneDigits);
    }
  }, [phoneDigits, onPhoneSubmitted]);

  const handleSkipPress = useCallback(() => {
    if (submitStartedRef.current) return;
    submitStartedRef.current = true;
    setIsSubmitting(true);
    onSkip();
  }, [onSkip]);

  // Stable styles — recreated only when themeMode changes.
  // Uses COMPACT sizing to fit small secondary displays (480×854 etc.).
  const s = useMemo(
    () => {
      const scale = (n: number) => Math.round(n * uiScale);
      const controlWidth = Math.max(220, Math.min(340, width - 32));
      const isNarrow = controlWidth < 260;
      const gap = scale(isNarrow ? 8 : 10);
      const keyHeight = scale(isNarrow ? 42 : 48);
      const buttonHeight = scale(isNarrow ? 40 : 44);
      const radius = scale(10);
      const titleSize = scale(12);
      const phoneSize = scale(16);
      const digitSize = scale(15);
      const actionSize = scale(10);
      const buttonTextSize = scale(10);

      return StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.screen,
        },
        body: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap,
          paddingHorizontal: scale(16),
          paddingVertical: scale(14),
        },
        iconCircle: {
          width: scale(84),
          height: scale(84),
          borderRadius: scale(42),
          backgroundColor: colors.tealMuted,
          alignItems: "center",
          justifyContent: "center",
          padding: scale(12),
        },
        headline: {
          width: controlWidth,
          fontSize: titleSize,
          lineHeight: titleSize + scale(14),
          fontFamily: "sans-serif",
          fontWeight: "600",
          color: colors.heading,
          textAlign: "center",
          textAlignVertical: "center",
          includeFontPadding: true,
          paddingHorizontal: scale(16),
          paddingVertical: scale(8),
        },
        headlineSvg: {
          width: controlWidth,
          height: scale(36),
        },
        phoneCard: {
          width: controlWidth,
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius + 1,
          minHeight: scale(50),
          paddingHorizontal: scale(12),
          paddingVertical: scale(6),
          alignItems: "center",
          justifyContent: "center",
        },
        phoneText: {
          width: "100%",
          minHeight: scale(34),
          fontSize: phoneSize,
          fontFamily: "sans-serif",
          fontWeight: "600",
          color: colors.heading,
          includeFontPadding: true,
          textAlign: "center",
          textAlignVertical: "center",
          paddingHorizontal: scale(12),
          paddingVertical: scale(6),
        },
        phoneSvg: {
          width: "100%",
          height: scale(40),
        },
        phonePlaceholder: {
          color: colors.label,
        },
        keypad: {
          width: controlWidth,
          gap,
        },
        numpadRow: {
          flexDirection: "row",
          gap,
        },
        numKey: {
          flex: 1,
          height: keyHeight,
          borderRadius: radius,
          backgroundColor: "transparent",
          borderWidth: 0,
          alignItems: "center",
          justifyContent: "center",
        },
        numKeyAction: {
          backgroundColor: "transparent",
        },
        numKeyText: {
          width: "100%",
          fontSize: digitSize,
          lineHeight: digitSize + scale(12),
          fontFamily: "sans-serif",
          fontWeight: "600",
          color: colors.heading,
          includeFontPadding: true,
          textAlign: "center",
          textAlignVertical: "center",
          paddingHorizontal: scale(10),
          paddingVertical: scale(6),
        },
        numKeySvg: {
          width: "100%",
          height: keyHeight,
        },
        numKeySmall: {
          width: "100%",
          fontSize: actionSize,
          lineHeight: actionSize + scale(12),
          fontFamily: "sans-serif",
          fontWeight: "600",
          color: colors.label,
          includeFontPadding: true,
          textAlign: "center",
          textAlignVertical: "center",
          paddingHorizontal: scale(10),
          paddingVertical: scale(6),
        },
        numKeySmallSvg: {
          width: "100%",
          height: keyHeight,
        },
        footerInner: {
          flexDirection: "row",
          gap,
          width: controlWidth,
        },
        skipBtn: {
          flex: 0.9,
          height: buttonHeight,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
        },
        skipBtnText: {
          width: "100%",
          fontSize: buttonTextSize,
          lineHeight: buttonTextSize + scale(14),
          fontFamily: "sans-serif",
          fontWeight: "600",
          color: colors.label,
          includeFontPadding: true,
          textAlign: "center",
          textAlignVertical: "center",
          paddingHorizontal: scale(12),
          paddingVertical: scale(7),
        },
        skipBtnSvg: {
          width: "100%",
          height: buttonHeight,
        },
        continueBtn: {
          flex: 1.1,
          height: buttonHeight,
          borderRadius: radius,
          backgroundColor: colors.teal,
          alignItems: "center",
          justifyContent: "center",
        },
        continueBtnDisabled: {
          opacity: 0.42,
        },
        continueBtnText: {
          width: "100%",
          fontSize: buttonTextSize,
          lineHeight: buttonTextSize + scale(14),
          fontFamily: "sans-serif",
          fontWeight: "700",
          color: colors.onSolid,
          includeFontPadding: true,
          textAlign: "center",
          textAlignVertical: "center",
          paddingHorizontal: scale(12),
          paddingVertical: scale(7),
        },
        continueBtnSvg: {
          width: "100%",
          height: buttonHeight,
        },
        submittingOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: scale(24),
        },
        submittingCard: {
          width: "100%",
          maxWidth: scale(300),
          backgroundColor: colors.panel,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: scale(14),
          paddingVertical: scale(20),
          paddingHorizontal: scale(20),
          alignItems: "center",
          gap: scale(10),
        },
        submittingText: {
          width: "100%",
          fontSize: scale(10),
          lineHeight: scale(22),
          fontWeight: "700",
          color: colors.heading,
          textAlign: "center",
          includeFontPadding: true,
          paddingHorizontal: scale(12),
          paddingVertical: scale(6),
        },
        submittingTextSvg: {
          width: "100%",
          height: scale(34),
        },
        submittingSubtext: {
          width: "100%",
          fontSize: scale(8),
          lineHeight: scale(20),
          fontWeight: "500",
          color: colors.label,
          textAlign: "center",
          includeFontPadding: true,
          paddingHorizontal: scale(12),
          paddingVertical: scale(6),
        },
        submittingSubtextSvg: {
          width: "100%",
          height: scale(30),
        },
      });
    },
    [height, themeMode, width, uiScale],
  );

  return (
    <View style={s.container}>
      <View style={s.body}>
        <View style={s.iconCircle}>
          <Gift size={Math.round(42 * uiScale)} color={colors.teal} strokeWidth={2.2} />
        </View>

        {/* Headline */}
        <Svg style={s.headlineSvg} viewBox="0 0 320 36">
          <SvgText
            x="160"
            y="18"
            textAnchor="middle"
            alignmentBaseline="middle"
            fontFamily="sans-serif"
            fontSize={14}
            fontWeight="600"
            fill={colors.heading}
          >
            Enter your phone number
          </SvgText>
        </Svg>

        {/* Phone display */}
        <View style={s.phoneCard}>
          <Svg style={s.phoneSvg} viewBox="0 0 320 40">
            <SvgText
              x="160"
              y="21"
              textAnchor="middle"
              alignmentBaseline="middle"
              fontFamily="sans-serif"
              fontSize={20}
              fontWeight="600"
              fill={phoneDigits.length === 0 ? colors.label : colors.heading}
            >
              {formatUSPhone(phoneDigits)}
            </SvgText>
          </Svg>
        </View>

        {/* Keypad rows */}
        <View style={s.keypad}>
          {keyRows.map((row, ri) => (
            <View key={ri} style={s.numpadRow}>
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.6}
                  onPress={() => handleKeyPress(key)}
                  style={s.numKey}
                >
                  <Svg style={s.numKeySvg} viewBox="0 0 100 48">
                    <SvgText
                      x="50"
                      y="24"
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontFamily="sans-serif"
                      fontSize={18}
                      fontWeight="600"
                      fill={colors.heading}
                    >
                      {key}
                    </SvgText>
                  </Svg>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <View style={s.numpadRow}>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => handleKeyPress("clear")}
              style={[s.numKey, s.numKeyAction]}
            >
              <Svg style={s.numKeySmallSvg} viewBox="0 0 100 48">
                <SvgText
                  x="50"
                  y="24"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontFamily="sans-serif"
                  fontSize={11}
                  fontWeight="600"
                  fill={colors.label}
                >
                  clear
                </SvgText>
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => handleKeyPress("0")}
              style={s.numKey}
            >
              <Svg style={s.numKeySvg} viewBox="0 0 100 48">
                <SvgText
                  x="50"
                  y="24"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontFamily="sans-serif"
                  fontSize={18}
                  fontWeight="600"
                  fill={colors.heading}
                >
                  0
                </SvgText>
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => handleKeyPress("backspace")}
              style={[s.numKey, s.numKeyAction]}
            >
              <Delete size={Math.round(18 * uiScale)} color={colors.heading} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer buttons */}
        <View style={s.footerInner}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSkipPress}
            style={s.skipBtn}
            disabled={isSubmitting}
          >
            <Svg style={s.skipBtnSvg} viewBox="0 0 120 44">
              <SvgText
                x="60"
                y="22"
                textAnchor="middle"
                alignmentBaseline="middle"
                fontFamily="sans-serif"
                fontSize={14}
                fontWeight="600"
                fill={colors.label}
              >
                Skip
              </SvgText>
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            style={[
              s.continueBtn,
              (!canSubmit || isSubmitting) && s.continueBtnDisabled,
            ]}
          >
            <Svg style={s.continueBtnSvg} viewBox="0 0 150 44">
              <SvgText
                x="75"
                y="22"
                textAnchor="middle"
                alignmentBaseline="middle"
                fontFamily="sans-serif"
                fontSize={14}
                fontWeight="700"
                fill={colors.onSolid}
              >
                Continue
              </SvgText>
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      {/* Submitting overlay */}
      {isSubmitting && (
        <View pointerEvents="auto" style={s.submittingOverlay}>
          <View style={s.submittingCard}>
            <ActivityIndicator size="large" color={colors.teal} />
            <Svg style={s.submittingTextSvg} viewBox="0 0 260 34">
              <SvgText
                x="130"
                y="17"
                textAnchor="middle"
                alignmentBaseline="middle"
                fontFamily="sans-serif"
                fontSize={12}
                fontWeight="700"
                fill={colors.heading}
              >
                Looking up your rewards...
              </SvgText>
            </Svg>
            <Svg style={s.submittingSubtextSvg} viewBox="0 0 260 30">
              <SvgText
                x="130"
                y="15"
                textAnchor="middle"
                alignmentBaseline="middle"
                fontFamily="sans-serif"
                fontSize={10}
                fontWeight="500"
                fill={colors.label}
              >
                This will only take a moment.
              </SvgText>
            </Svg>
          </View>
        </View>
      )}
    </View>
  );
}
