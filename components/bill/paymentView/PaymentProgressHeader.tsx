import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PaymentProgressHeader: React.FC = () => {
  const { view, activeSplitId, splits } = usePaymentStore();
  const { activeOrderTotal, activeOrderOutstandingTotal } = useOrderStore();

  // Animation Value
  const progressWidth = useSharedValue(0);

  // --- LOGIC: HEADCOUNT + FINANCIAL PROGRESS ---
  const targetProgress = useMemo(() => {
    // 1. Success is always 100%
    if (view === "success") return 100;

    // 2. Setup Phase Logic (0% - 20%)
    const isSetupPhase = [
      "review",
      "split-options",
      "split-by-item",
      "split-evenly",
      "split-custom-amount",
    ].includes(view);

    if (isSetupPhase) {
      switch (view) {
        case "review":
          return 5;
        case "split-options":
          return 10;
        case "split-by-item":
        case "split-evenly":
        case "split-custom-amount":
          return 15 + (splits.length > 0 ? 5 : 0);
        default:
          return 10;
      }
    }

    // 3. Execution Phase Logic (20% - 100%)
    // We determine progress by comparing "Work Done" vs "Total Work"
    const BASE = 5;
    const RANGE = 80; // Remaining 80% of the bar

    let progressRatio = 0;

    // SCENARIO A: SPLIT PAYMENT
    if (splits.length > 0) {
      const totalGuests = splits.length;
      // Count how many guests are fully paid
      const paidGuests = splits.filter((s) => s.status === "paid").length;

      // Are we currently working on a guest? (Active ID exists)
      // If yes, we are part-way through THAT specific guest.
      // Let's give 0.5 points for "Selecting Method" and 0.8 points for "Entering Card/Cash"
      let currentGuestBonus = 0;

      if (activeSplitId) {
        if (view === "payment-method-selection")
          currentGuestBonus = 0.1; // Just started this guest
        else if (["card", "cash", "manual", "cardOptions"].includes(view))
          currentGuestBonus = 0.5; // Halfway done with this guest
      }

      // Formula: (Paid Guests + Current Effort) / Total Guests
      progressRatio = (paidGuests + currentGuestBonus) / totalGuests;
    }

    // SCENARIO B: SINGLE PAYMENT
    else {
      const total = activeOrderTotal > 0 ? activeOrderTotal : 1;
      const paid = total - activeOrderOutstandingTotal;
      const moneyRatio = paid / total;

      // Bonus for being on input screens in single pay mode
      let activityBonus = 0;
      if (["card", "cash", "manual", "cardOptions"].includes(view)) {
        // If we haven't paid anything yet but are typing, give visual progress (e.g. 10%)
        if (moneyRatio < 0.1) activityBonus = 0.1;
      }

      progressRatio = moneyRatio + activityBonus;
    }

    // Calculate final %
    const final = BASE + progressRatio * RANGE;

    // Cap at 98% (Wait for final success screen for 100%)
    return Math.min(Math.round(final), 98);
  }, [
    view,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    activeSplitId,
    splits,
  ]);

  // --- LABEL LOGIC ---
  const progressLabel = useMemo(() => {
    if (view === "success") return "Complete";

    // 1. Split Specific Labels
    if (activeSplitId && splits.length > 0) {
      const currentGuestIndex = splits.findIndex((s) => s.id === activeSplitId);
      const guest = splits[currentGuestIndex];
      // "Paying: Guest 2 of 3"
      return `Paying: ${guest?.customerName} (${currentGuestIndex + 1}/${splits.length})`;
    }

    // 2. Balance Label
    if (
      activeOrderOutstandingTotal < activeOrderTotal &&
      activeOrderOutstandingTotal > 0.01
    ) {
      return `Balance: $${activeOrderOutstandingTotal.toFixed(2)}`;
    }

    // 3. Generic Labels
    switch (view) {
      case "payment-method-selection":
        return "Select Method";
      case "cardOptions":
        return "Card Options";
      case "manual":
        return "Manual Entry";
      case "card":
        return "Read Card";
      case "cash":
        return "Cash Entry";
      case "split-options":
        return "Split Options";
      case "split-by-item":
        return "Assign Items";
      case "split-evenly":
        return "Split Evenly";
      case "split-custom-amount":
        return "Custom Split";
      case "review":
        return "Review Order";
      default:
        return "Processing";
    }
  }, [
    view,
    activeSplitId,
    splits,
    activeOrderTotal,
    activeOrderOutstandingTotal,
  ]);

  // Update animation
  useEffect(() => {
    progressWidth.value = withTiming(targetProgress, { duration: 500 });
  }, [targetProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  return (
    <View className="w-full px-6 py-3 bg-[#212121] border-b border-[#333]">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-gray-400 text-xs font-bold uppercase tracking-widest">
          {progressLabel}
        </Text>
        <Text className="text-blue-400 text-xs font-bold">
          {Math.round(targetProgress)}%
        </Text>
      </View>

      <View className="h-1.5 w-full bg-[#333333] rounded-full overflow-hidden">
        <Animated.View
          className="h-full bg-blue-600 rounded-full"
          style={animatedStyle}
        />
      </View>
    </View>
  );
};

export default PaymentProgressHeader;
