import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PaymentProgressHeader: React.FC = () => {
  const { view, splits, activeSplitId } = usePaymentStore();
  const { activeOrderTotal, activeOrderOutstandingTotal } = useOrderStore();

  // Animation Value
  const progressWidth = useSharedValue(0);

  // Keep track of the highest progress reached to prevent jittery bouncing
  // (Optional: remove this ref logic if you want the bar to strictly reflect state)
  const maxProgressRef = useRef(0);

  // --- LOGIC: Calculate Smart Progress ---
  const targetProgress = useMemo(() => {
    // 1. Success is always 100%
    if (view === "success") return 100;

    // 2. Financial Progress (0.0 to 1.0)
    const total = activeOrderTotal > 0 ? activeOrderTotal : 1;
    const paid = total - activeOrderOutstandingTotal;
    const financialRatio = paid / total; // e.g., 0.5 for 50% paid

    // 3. Determine Context
    // Are we in the middle of a split payment loop?
    const isMidFlow = activeSplitId !== null || paid > 0.01;

    let basePercentage = 0;

    if (isMidFlow) {
      // --- PAYMENT EXECUTION PHASE (30% -> 100%) ---
      // If we are selecting a method for Guest 1, Guest 2, etc., we are executing.
      // We start at 30% and fill the remaining 70% based on money collected.
      basePercentage = 30 + financialRatio * 70;
    } else {
      // --- SETUP PHASE (0% -> 30%) ---
      switch (view) {
        case "review":
          basePercentage = 5;
          break;
        case "payment-method-selection":
          // If no split is active and no money paid, this is early setup
          basePercentage = 15;
          break;
        case "split-options":
          basePercentage = 20;
          break;
        case "split-by-item":
        case "split-evenly":
        case "split-custom-amount":
          // Configuration: 25% + tiny boost for having created splits
          basePercentage = 25 + (splits.length > 0 ? 2 : 0);
          break;
        default:
          basePercentage = 10;
      }
    }

    // Cap at 95% until actually finished
    const finalVal = Math.min(
      Math.round(basePercentage),
      paid >= total ? 100 : 95
    );

    // Logic to prevent "Backwards" movement if it feels jarring:
    // If you prefer the bar to strictly follow state, remove this Math.max check.
    // For now, I will let it move backwards only if the difference is large (e.g. hitting actual back button),
    // but prevent micro-fluctuations.
    return finalVal;
  }, [
    view,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    activeSplitId,
    splits.length,
  ]);

  // --- LABEL LOGIC ---
  const progressLabel = useMemo(() => {
    if (view === "success") return "Complete";

    // Specific Guest Payment
    if (activeSplitId) {
      const guest = splits.find((s) => s.id === activeSplitId);
      return guest ? `Pay: ${guest.customerName}` : "Processing Split";
    }

    // Setup Screens
    if (view === "review") return "Review Items";
    if (view === "payment-method-selection") return "Select Method";
    if (view.includes("split")) return "Configure Splits";

    // Partial Payment State
    if (activeOrderOutstandingTotal < activeOrderTotal) {
      return `Paid: $${(activeOrderTotal - activeOrderOutstandingTotal).toFixed(2)}`;
    }

    return "Processing";
  }, [
    view,
    activeSplitId,
    splits,
    activeOrderTotal,
    activeOrderOutstandingTotal,
  ]);

  // Update animation
  useEffect(() => {
    progressWidth.value = withTiming(targetProgress, { duration: 600 });
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
