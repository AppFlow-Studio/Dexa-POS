import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext.base";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { Check, Gift } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from "react-native-reanimated";
import Svg, { Text as SvgText } from "react-native-svg";

export function NativeLoyaltyConfirmationScreen() {
  const { loyaltyResult, themeMode } = useCFDDisplayData();
  const programs = loyaltyResult?.programs ?? [];
  const hasProgramResults = programs.length > 0;
  const customerName = loyaltyResult?.customerName;
  const hasUnlockedReward = programs.some((p) => p.rewardUnlocked);
  const uiScale = useUiScale();
  const styles = useMemo(() => {
    const s = (n: number) => Math.round(n * uiScale);
    return StyleSheet.create({
      container: {
        flex: 1,
        backgroundColor: colors.screen,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: s(18),
      },
      iconCircle: {
        width: s(84),
        height: s(84),
        borderRadius: s(42),
        backgroundColor: colors.teal,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: s(16),
      },
      contentGroup: {
        width: "100%",
        alignItems: "center",
      },
      titleSvg: {
        width: "100%",
        maxWidth: s(340),
        height: s(52),
      },
      subtitleSvg: {
        width: "100%",
        maxWidth: s(340),
        height: s(42),
        marginTop: s(4),
      },
      customerSvg: {
        width: "100%",
        maxWidth: s(340),
        height: s(38),
        marginTop: s(4),
      },
      rewardBanner: {
        marginTop: s(14),
        minHeight: s(42),
        paddingHorizontal: s(12),
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: s(6),
      },
      rewardSvg: {
        width: s(210),
        height: s(34),
      },
    });
  }, [themeMode, uiScale]);

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.container}>
      <Animated.View
        entering={ZoomIn.duration(260).springify().damping(18).stiffness(180)}
        style={styles.iconCircle}
      >
        <Check size={Math.round(44 * uiScale)} color={colors.screen} strokeWidth={3} />
      </Animated.View>

      <Animated.View
        entering={FadeInUp.duration(280).delay(70)}
        style={styles.contentGroup}
      >
        <Svg style={styles.titleSvg} viewBox="0 0 320 52">
          <SvgText
            x="160"
            y="26"
            textAnchor="middle"
            alignmentBaseline="middle"
            fontFamily="sans-serif"
            fontSize={34}
            fontWeight="700"
            fill={colors.teal}
          >
            Thank you!
          </SvgText>
        </Svg>

        <Svg style={styles.subtitleSvg} viewBox="0 0 340 42">
          <SvgText
            x="170"
            y="21"
            textAnchor="middle"
            alignmentBaseline="middle"
            fontFamily="sans-serif"
            fontSize={14}
            fontWeight="500"
            fill={colors.label}
          >
            {hasProgramResults
              ? "Loyalty points were added."
              : "Your loyalty information was received."}
          </SvgText>
        </Svg>

        {customerName ? (
          <Svg style={styles.customerSvg} viewBox="0 0 340 38">
            <SvgText
              x="170"
              y="19"
              textAnchor="middle"
              alignmentBaseline="middle"
              fontFamily="sans-serif"
              fontSize={15}
              fontWeight="600"
              fill={colors.heading}
            >
              {`Welcome back, ${customerName}`}
            </SvgText>
          </Svg>
        ) : null}
      </Animated.View>

      {hasUnlockedReward ? (
        <Animated.View
          entering={FadeInDown.duration(260).delay(220)}
          style={styles.rewardBanner}
        >
          <Gift size={Math.round(18 * uiScale)} color={colors.teal} />
          <Svg style={styles.rewardSvg} viewBox="0 0 210 34">
            <SvgText
              x="105"
              y="17"
              textAnchor="middle"
              alignmentBaseline="middle"
              fontFamily="sans-serif"
              fontSize={13}
              fontWeight="600"
              fill={colors.heading}
            >
              You earned a reward!
            </SvgText>
          </Svg>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
