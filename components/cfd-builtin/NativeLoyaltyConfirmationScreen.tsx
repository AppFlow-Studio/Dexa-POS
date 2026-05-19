import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext.base";
import { colors } from "@/lib/theme";
import { Check, Gift } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";

export function NativeLoyaltyConfirmationScreen() {
  const { loyaltyResult } = useCFDDisplayData();
  const programs = loyaltyResult?.programs ?? [];
  const hasProgramResults = programs.length > 0;
  const customerName = loyaltyResult?.customerName;
  const hasUnlockedReward = programs.some((p) => p.rewardUnlocked);

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Check size={44} color={colors.screen} strokeWidth={3} />
      </View>

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

      {hasUnlockedReward ? (
        <View style={styles.rewardBanner}>
          <Gift size={18} color={colors.teal} />
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
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screen,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  titleSvg: {
    width: "100%",
    maxWidth: 340,
    height: 52,
  },
  subtitleSvg: {
    width: "100%",
    maxWidth: 340,
    height: 42,
    marginTop: 4,
  },
  customerSvg: {
    width: "100%",
    maxWidth: 340,
    height: 38,
    marginTop: 4,
  },
  rewardBanner: {
    marginTop: 14,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  rewardSvg: {
    width: 210,
    height: 34,
  },
});
