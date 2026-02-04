import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PaymentProgressHeader: React.FC = () => {
  const view = usePaymentStore((s) => s.view);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const splits = usePaymentStore((s) => s.splits);
  const orderTotals = useActiveOrderTotals();
  const activeOrderTotal = orderTotals?.total ?? 0;
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0;

  const progressWidth = useSharedValue(0);

  const targetProgress = useMemo(() => {
    // --- 1. DEFINITIVE END STATE ---
    if (view === "success") return 100;

    // --- 2. DETERMINE PHASE ---
    // Are we in the "Setup" phase or the "Payment Execution" phase?

    // Execution Phase starts if:
    // a) We have an active split selected (loop started)
    // b) We have successfully paid some money (partial payment)
    // c) We are on a direct payment input screen (Cash/Card)
    const total = activeOrderTotal > 0 ? activeOrderTotal : 1;
    const paidAmount = total - activeOrderOutstandingTotal;

    const isExecutionPhase =
      activeSplitId !== null ||
      paidAmount > 0.01 ||
      ["card", "cash", "manual", "cardOptions"].includes(view);

    // --- 3. SETUP PHASE LOGIC (0% - 20%) ---
    if (!isExecutionPhase) {
      switch (view) {
        case "review":
          return 5;
        case "payment-method-selection":
          return 10; // Entry point (Lowest)
        case "split-options":
          return 15; // Moving forward
        case "split-by-item":
        case "split-evenly":
        case "split-custom-amount":
          return 20; // Configuration done
        default:
          return 10;
      }
    }

    // --- 4. EXECUTION PHASE LOGIC (20% - 100%) ---
    const BASE = 20;
    const RANGE = 80;
    let executionRatio = 0;

    // SCENARIO A: SPLIT PAYMENT LOOP
    if (splits.length > 0) {
      const totalGuests = splits.length;
      const paidGuestsCount = splits.filter((s) => s.status === "paid").length;

      // Calculate bonus for the CURRENT working guest (if any)
      let currentGuestProgress = 0;

      // Only add bonus if the active split is NOT paid yet.
      // (If it's paid, it's counted in paidGuestsCount already)
      if (activeSplitId) {
        const activeSplit = splits.find((s) => s.id === activeSplitId);
        if (activeSplit && activeSplit.status === "pending") {
          if (view === "payment-method-selection") {
            currentGuestProgress = 0.1; // Started selecting
          } else if (["card", "cash", "manual", "cardOptions"].includes(view)) {
            currentGuestProgress = 0.5; // Inputting data
          }
        }
      }

      // Formula: (Fully Paid Guests + Progress on Current Pending Guest) / Total Guests
      executionRatio = (paidGuestsCount + currentGuestProgress) / totalGuests;
    }

    // SCENARIO B: SINGLE PAYMENT (No Splits)
    else {
      // Simple ratio of money paid
      const moneyRatio = paidAmount / total;

      let activityBonus = 0;
      // If we haven't paid yet but are on input screen, give visual progress
      if (
        moneyRatio < 0.01 &&
        ["card", "cash", "manual", "cardOptions"].includes(view)
      ) {
        activityBonus = 0.1;
      }

      executionRatio = moneyRatio + activityBonus;
    }

    const final = BASE + executionRatio * RANGE;
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

    if (activeSplitId && splits.length > 0) {
      const index = splits.findIndex((s) => s.id === activeSplitId);
      const guest = splits[index];
      if (guest) {
        return `Paying: ${guest.customerName} (${index + 1}/${splits.length})`;
      }
    }

    if (
      activeOrderOutstandingTotal < activeOrderTotal &&
      activeOrderOutstandingTotal > 0.01
    ) {
      return `Balance Due: $${activeOrderOutstandingTotal.toFixed(2)}`;
    }

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
        return "Custom Amounts";
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
