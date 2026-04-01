// components/cfd-client/LoyaltyConfirmationScreen.tsx
import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { Check } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export function LoyaltyConfirmationScreen() {
  const { loyaltyResult } = useCFDDisplayData();
  const programs = loyaltyResult?.programs ?? [];
  const customerName = loyaltyResult?.customerName;
  const hasUnlockedReward = programs.some((p) => p.rewardUnlocked);

  const iconScale = useSharedValue(0.7);
  const iconOpacity = useSharedValue(0);

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 150 });
    iconScale.value = withSpring(1, { damping: 18, stiffness: 220, mass: 0.6 });
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconContainer, iconStyle]}>
        <Check size={64} color="#ffffff" strokeWidth={3} />
      </Animated.View>

      <Animated.Text entering={FadeInUp.duration(280).delay(80)} style={styles.title}>
        Thank you!
      </Animated.Text>

      {customerName ? (
        <Animated.Text entering={FadeInUp.duration(280).delay(140)} style={styles.welcomeText}>
          Welcome back, {customerName}!
        </Animated.Text>
      ) : null}

      {programs.length > 0 ? (
        <View style={styles.programsContainer}>
          {programs.map((program, idx) => (
            <Animated.View
              key={idx}
              entering={FadeInUp.duration(280).delay(180 + idx * 60)}
              style={styles.programRow}
            >
              <ProgramSummary program={program} />
            </Animated.View>
          ))}
        </View>
      ) : null}

      {hasUnlockedReward ? (
        <Animated.View
          entering={FadeInUp.duration(280).delay(260)}
          style={styles.rewardBanner}
        >
          <Text style={styles.rewardBannerText}>🎉 You earned a reward!</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

interface Program {
  name: string;
  type: string;
  earned: number;
  newBalance: number;
  rewardUnlocked: boolean;
}

function ProgramSummary({ program }: { program: Program }) {
  const { type, earned, newBalance, name } = program;

  let earnedText = "";
  let balanceText = "";

  if (type === "points") {
    earnedText = `You earned ${earned} pt${earned !== 1 ? "s" : ""}`;
    balanceText = `${newBalance} pts total`;
  } else if (type === "visits") {
    earnedText = `Visit counted!`;
    balanceText = `${newBalance} visit${newBalance !== 1 ? "s" : ""}`;
  } else if (type === "punch_card") {
    earnedText = `${earned} punch${earned !== 1 ? "es" : ""} added!`;
    balanceText = `${newBalance} total`;
  } else {
    earnedText = `${earned} earned`;
    balanceText = `${newBalance} total`;
  }

  return (
    <View style={styles.programCard}>
      <Text style={styles.programName}>{name}</Text>
      <Text style={styles.programEarned}>{earnedText}</Text>
      <Text style={styles.programBalance}>{balanceText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 20,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 48,
    fontWeight: "800",
    color: "#10b981",
    letterSpacing: -1,
  },
  welcomeText: {
    fontSize: 24,
    color: "#a3a3a3",
    fontWeight: "500",
  },
  programsContainer: {
    gap: 12,
    width: "100%",
    maxWidth: 480,
  },
  programRow: {
    width: "100%",
  },
  programCard: {
    backgroundColor: "#171717",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 4,
    alignItems: "center",
  },
  programName: {
    fontSize: 14,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
  },
  programEarned: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
  },
  programBalance: {
    fontSize: 18,
    color: "#10b981",
    fontWeight: "600",
  },
  rewardBanner: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.4)",
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  rewardBannerText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#eab308",
  },
});
