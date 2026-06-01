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

  const mainBtn = {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const,
    justifyContent: 'center' as const, height: 36, borderRadius: 8,
    gap: 5, borderWidth: 1, paddingHorizontal: 10,
  };

  const renderDefaultButtons = () => {
    const hasItems = (activeOrder?.items?.length ?? 0) > 0;
    const isBalanceZero = hasItems && totalDisplayAmount <= 0 && !isSyncing;

    if (isSyncing) {
      return (
        <Animated.View style={{ opacity: pulseAnim, flex: 1 }}>
          <View style={{ ...mainBtn, backgroundColor: colors.border + '30', borderColor: colors.border }}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }} numberOfLines={1}>Syncing...</Text>
          </View>
        </Animated.View>
      );
    }

    return (
      <TouchableOpacity
        onPress={onPressTotal}
        activeOpacity={0.7}
        style={{ ...mainBtn, backgroundColor: colors.teal + '18', borderColor: colors.teal + '50' }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }} numberOfLines={1}>
          ${totalDisplayAmount.toFixed(2)}
        </Text>
        <ShoppingCart size={13} color={colors.teal} />
      </TouchableOpacity>
    );
  };

  const renderPaidButtons = () => (
    <>
      <TouchableOpacity onPress={onPressCloseCheck} activeOpacity={0.7}
        style={{ ...mainBtn, backgroundColor: colors.success + '15', borderColor: colors.success + '40' }}>
        <CheckCircle size={13} color={colors.success} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>Close</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onPressClearTable} activeOpacity={0.7}
        style={{ ...mainBtn, backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }}>
        <Trash2 size={13} color={colors.danger} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => (
    <>
      <TouchableOpacity onPress={onPressClearTable} activeOpacity={0.7}
        style={{ ...mainBtn, backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }}>
        <Trash2 size={13} color={colors.danger} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>Clear</Text>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
      <TouchableOpacity
        onPress={onPressMore}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 36, paddingHorizontal: 12, borderRadius: 8, gap: 5, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
      >
        <MoreHorizontal size={14} color={colors.label} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>More</Text>
      </TouchableOpacity>

      {/* Dynamic Buttons (Discount/Total or Close/Clear) */}
      {renderButtons()}
    </View>
  );
};

export default React.memo(BottomActionBar, (prev, next) => {
  return (
    prev.totalDisplayAmount === next.totalDisplayAmount &&
    prev.isFullyPaid === next.isFullyPaid &&
    prev.paymentCount === next.paymentCount &&
    prev.onPressMore === next.onPressMore &&
    prev.onPressTotal === next.onPressTotal &&
    prev.onPressReopenCheck === next.onPressReopenCheck &&
    prev.onPressCloseCheck === next.onPressCloseCheck &&
    prev.onPressClearTable === next.onPressClearTable &&
    prev.onPressDiscount === next.onPressDiscount &&
    prev.activeOrder?.id === next.activeOrder?.id &&
    prev.activeOrder?.paid_status === next.activeOrder?.paid_status &&
    prev.activeOrder?.check_status === next.activeOrder?.check_status
  );
});
