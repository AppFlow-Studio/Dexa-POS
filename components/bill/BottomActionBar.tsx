import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  CheckCircle,
  CreditCard,
  MoreHorizontal,
  RotateCcw,
  ShoppingCart,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface BottomActionBarProps {
  activeOrder: OrderProfile | undefined;
  onPressMore: () => void;
  onPressTotal: () => void;
  onPressReopenCheck: () => void;
  onPressCloseCheck: () => void;
  onPressClearTable: () => void;
  onPressDiscount: () => void;
  totalDisplayAmount: number;
  isFullyPaid?: boolean; // LOCAL-FIRST: Use local calculation from parent
  paymentCount?: number; // Number of payments made for displaying badge
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
  activeOrder,
  onPressMore,
  onPressTotal,
  onPressReopenCheck,
  onPressCloseCheck,
  onPressClearTable,
  onPressDiscount,
  totalDisplayAmount,
  isFullyPaid: isFullyPaidProp,
  paymentCount,
}) => {
  // Subscribe to payment sync status for loading state
  const paymentSyncStatus = useOrderStore((state) => state.paymentSyncStatus);
  const isSyncing = paymentSyncStatus === "syncing";

  // Pulsing animation for syncing state
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSyncing]);

  // Shared styling — main buttons take remaining space, More is compact
  const mainButtonClass =
    "flex-1 flex-row items-center justify-center h-12 px-3 rounded-xl gap-2";
  const moreButtonClass =
    "flex-row items-center justify-center h-12 px-4 rounded-xl gap-2";

  const renderDefaultButtons = () => (
    <>
      {/* Discount Button: Indigo (Distinct from Blue, fits dark theme) */}
      {/* <TouchableOpacity
        onPress={onPressDiscount}
        className={`${mainButtonClass} bg-indigo-600`}
        activeOpacity={0.7}
      >
        <Percent size={18} color="white" />
        <Text className="font-semibold text-white text-base">Discount</Text>
      </TouchableOpacity> */}

      {/* Total Button: Blue (Primary Action), Green Close Check (balance $0), or Gray (Syncing) */}
      {(() => {
        // Check if balance is zero (order is fully paid but may be reopened)
        const hasItems = (activeOrder?.items?.length ?? 0) > 0;
        const isBalanceZero = hasItems && totalDisplayAmount <= 0 && !isSyncing;

        // Show syncing state with pulsing animation
        if (isSyncing) {
          return (
            <Animated.View style={{ opacity: pulseAnim, flex: 1 }}>
              <View className={`${mainButtonClass} bg-gray-600`}>
                <ActivityIndicator size="small" color="white" />
                <Text
                  className="font-semibold text-white text-base"
                  numberOfLines={1}
                >
                  Syncing...
                </Text>
              </View>
            </Animated.View>
          );
        }

        // When balance is $0, show payment status badge (non-clickable indicator)
        // Close Check action has been moved to the More button's bottom sheet
        if (isBalanceZero) {
          const paymentsText = paymentCount
            ? `${paymentCount} payment${paymentCount > 1 ? "s" : ""} made`
            : "Partially Paid";

          return (
            <View
              className={`${mainButtonClass} bg-emerald-600/20 border border-emerald-500`}
            >
              <CheckCircle size={18} color={colors.success} />
              <Text
                className="font-semibold text-emerald-400 text-base"
                numberOfLines={1}
              >
                {paymentsText}
              </Text>
            </View>
          );
        }

        // Normal case - show Total amount
        return (
          <TouchableOpacity
            onPress={onPressTotal}
            className={`${mainButtonClass} bg-teal`}
            activeOpacity={0.7}
          >
            <Text
              className="font-bold text-white text-base"
              numberOfLines={1}
            >
              ${totalDisplayAmount.toFixed(2)}
            </Text>
            <ShoppingCart size={18} color="white" />
          </TouchableOpacity>
        );
      })()}
    </>
  );

  const renderPaidButtons = () => (
    <>
      {/* Close Check: Emerald Green (Success/Finish) */}
      <TouchableOpacity
        onPress={onPressCloseCheck}
        className={`${mainButtonClass} bg-emerald-600`}
        activeOpacity={0.7}
      >
        <CheckCircle size={18} color="white" />
        <Text className="font-semibold text-white text-base">Close</Text>
      </TouchableOpacity>

      {/* Clear Table: Red (Destructive) */}
      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${mainButtonClass} bg-red-900/40 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color={colors.danger} />
        <Text className="font-semibold text-red-100 text-base">Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => (
    <>
      {/* Reopen: Amber (Undo/Correction) */}
      <TouchableOpacity
        onPress={onPressReopenCheck}
        className={`${mainButtonClass} bg-amber-600`}
        activeOpacity={0.7}
      >
        <RotateCcw size={18} color="white" />
        <Text className="font-semibold text-white text-base">Reopen</Text>
      </TouchableOpacity>

      {/* Clear Table: Red */}
      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${mainButtonClass} bg-red-900/40 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color={colors.danger} />
        <Text className="font-semibold text-red-100 text-base">Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderButtons = () => {
    if (!activeOrder) {
      return renderDefaultButtons();
    }

    // CRITICAL: Only show Reopen button when check is ACTUALLY closed in database
    // This prevents the "Check is not closed" error from backend
    if (activeOrder.check_status === "Closed") {
      return renderClosedButtons(); // Reopen + Clear
    }

    // If fully paid but check not yet closed, show Close + Clear
    // This gives user the option to close the check
    if (isFullyPaidProp || activeOrder.paid_status === "Paid") {
      return renderPaidButtons(); // Close + Clear
    }

    return renderDefaultButtons();
  };

  return (
    // Container: Removed "justify-between", added "gap-3"
    <View className="flex-row items-center py-3 px-4 bg-surface border-t border-gray-700 gap-3">
      {/* More Button: Compact, no flex */}
      <TouchableOpacity
        onPress={onPressMore}
        className={`${moreButtonClass} bg-panel border border-gray-600`}
        activeOpacity={0.7}
      >
        <MoreHorizontal size={20} color="white" />
        <Text className="font-semibold text-white text-base">More</Text>
      </TouchableOpacity>

      {/* Dynamic Buttons (Discount/Total or Close/Clear) */}
      {renderButtons()}
    </View>
  );
};

export default BottomActionBar;
