import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  CheckCircle,
  CreditCard,
  Loader2,
  MoreHorizontal,
  Percent,
  RotateCcw,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Text, TouchableOpacity, View } from "react-native";

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

  // Shared styling: flex-1 ensures they all take equal width
  const buttonBaseClass =
    "flex-1 flex-row items-center justify-center h-12 px-2 rounded-lg gap-2";

  const renderDefaultButtons = () => (
    <>
      {/* Discount Button: Indigo (Distinct from Blue, fits dark theme) */}
      {/* <TouchableOpacity
        onPress={onPressDiscount}
        className={`${buttonBaseClass} bg-indigo-600`}
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
            <Animated.View
              style={{ opacity: pulseAnim, flex: 1 }}
            >
              <View
                className={`${buttonBaseClass} bg-gray-600`}
              >
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
            ? `${paymentCount} payment${paymentCount > 1 ? 's' : ''} made`
            : "Partially Paid";

          return (
            <View
              className={`${buttonBaseClass} bg-emerald-600/20 border border-emerald-500`}
            >
              <CheckCircle size={18} color="#10b981" />
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
            className={`${buttonBaseClass} bg-blue-600`}
            activeOpacity={0.7}
          >
            <Text
              className="font-semibold text-white text-base"
              numberOfLines={1}
            >
              ${totalDisplayAmount.toFixed(2)}
            </Text>
            <CreditCard size={18} color="white" />
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
        className={`${buttonBaseClass} bg-emerald-600`}
        activeOpacity={0.7}
      >
        <CheckCircle size={18} color="white" />
        <Text className="font-semibold text-white text-base">Close</Text>
      </TouchableOpacity>

      {/* Clear Table: Red (Destructive) */}
      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${buttonBaseClass} bg-red-900/40 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color="#fca5a5" />
        <Text className="font-semibold text-red-100 text-base">Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => (
    <>
      {/* Reopen: Amber (Undo/Correction) */}
      <TouchableOpacity
        onPress={onPressReopenCheck}
        className={`${buttonBaseClass} bg-amber-600`}
        activeOpacity={0.7}
      >
        <RotateCcw size={18} color="white" />
        <Text className="font-semibold text-white text-base">Reopen</Text>
      </TouchableOpacity>

      {/* Clear Table: Red */}
      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${buttonBaseClass} bg-red-900/40 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color="#fca5a5" />
        <Text className="font-semibold text-red-100 text-base">Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderButtons = () => {
    if (!activeOrder) {
      return renderDefaultButtons();
    }

    // LOCAL-FIRST: Prioritize local isFullyPaid calculation from parent
    // This ensures buttons update immediately without waiting for backend sync
    if (isFullyPaidProp) {
      return renderClosedButtons(); // Reopen + Clear - order is fully paid locally
    }

    // Fallback to backend status if local calculation not provided
    if (activeOrder.check_status === "Closed") {
      return renderClosedButtons();
    }
    if (activeOrder.paid_status === "Paid") {
      return renderClosedButtons(); // Changed from renderPaidButtons to show Reopen + Clear
    }
    return renderDefaultButtons();
  };

  return (
    // Container: Removed "justify-between", added "gap-3"
    <View className="flex-row items-center py-4 px-4 bg-[#303030] border-t border-gray-700 gap-3">
      {/* More Button: Now has text and uses flex-1 */}
      <TouchableOpacity
        onPress={onPressMore}
        className={`${buttonBaseClass} bg-[#212121] border border-gray-600`}
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
