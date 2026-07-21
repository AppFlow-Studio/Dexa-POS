import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  CheckCircle,
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
import { useUiScale } from "@/lib/uiScale";

interface BottomActionBarProps {
  activeOrder: OrderProfile | undefined;
  onPressMore: () => void;
  onPressTotal: () => void;
  onPressCloseCheck: () => void;
  onPressReopenCheck: () => void;
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
  onPressCloseCheck,
  onPressReopenCheck,
  onPressClearTable,
  onPressDiscount,
  totalDisplayAmount,
  isFullyPaid: isFullyPaidProp,
  paymentCount,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  // Subscribe to payment sync status for loading state
  const paymentSyncStatus = useOrderStore((state) => state.paymentSyncStatus);
  const isSyncing = paymentSyncStatus === "syncing";

  // Pulsing animation for syncing state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isTerminal =
    activeOrder?.order_status === "void" ||
    activeOrder?.order_status === "cancelled" ||
    activeOrder?.order_status === "refunded";
  const canReopenClosedCheck =
    activeOrder?.check_status === "Closed" &&
    !isTerminal &&
    (activeOrder?.reopen_count ?? 0) < 1;
  const isMoreButtonDisabled =
    activeOrder?.check_status === "Closed" && !canReopenClosedCheck;

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
    justifyContent: 'center' as const, height: s(36), borderRadius: s(8),
    gap: s(5), borderWidth: 1, paddingHorizontal: s(10),
  };

  const renderDefaultButtons = () => {
    if (isSyncing) {
      return (
        <Animated.View style={{ opacity: pulseAnim, flex: 1 }}>
          <View style={{ ...mainBtn, backgroundColor: colors.border + '30', borderColor: colors.border }}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.muted }} numberOfLines={1}>Syncing...</Text>
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
        <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.teal }} numberOfLines={1}>
          ${totalDisplayAmount.toFixed(2)}
        </Text>
        <ShoppingCart size={s(13)} color={colors.teal} />
      </TouchableOpacity>
    );
  };

  const renderPaidButtons = () => (
    <>
      <TouchableOpacity onPress={onPressCloseCheck} activeOpacity={0.7}
        style={{ ...mainBtn, backgroundColor: colors.success + '15', borderColor: colors.success + '40' }}>
        <CheckCircle size={s(13)} color={colors.success} />
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.success }}>Close</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onPressClearTable} activeOpacity={0.7}
        style={{ ...mainBtn, backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }}>
        <Trash2 size={s(13)} color={colors.danger} />
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.danger }}>Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => {
    // A check may be reopened at most once, and never once the order is
    // terminally done (voided / refunded / cancelled). reopen_count is the
    // backend source of truth (synced via orderTransformers); the status guard
    // covers closed-and-done orders where reopening would error.
    return (
    <>
      <TouchableOpacity
        onPress={canReopenClosedCheck ? onPressReopenCheck : undefined}
        activeOpacity={canReopenClosedCheck ? 0.7 : 1}
        disabled={!canReopenClosedCheck}
        style={{ ...mainBtn, backgroundColor: canReopenClosedCheck ? colors.teal + '18' : colors.border + '30', borderColor: canReopenClosedCheck ? colors.teal + '50' : colors.border }}>
        <RotateCcw size={s(13)} color={canReopenClosedCheck ? colors.teal : colors.muted} />
        <Text style={{ fontSize: s(12), fontWeight: '600', color: canReopenClosedCheck ? colors.teal : colors.muted }}>Reopen</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onPressClearTable} activeOpacity={0.7}
        style={{ ...mainBtn, backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }}>
        <Trash2 size={s(13)} color={colors.danger} />
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.danger }}>Clear</Text>
      </TouchableOpacity>
    </>
  );
  };

  const renderButtons = () => {
    if (!activeOrder) {
      return renderDefaultButtons();
    }

    // CRITICAL: Only show Reopen button when check is ACTUALLY closed in database
    // This prevents the "Check is not closed" error from backend
    if (activeOrder.check_status === "Closed") {
      return renderClosedButtons();
    }

    // If fully paid but check not yet closed, show Close + Clear
    // This gives user the option to close the check
    if (isFullyPaidProp ?? (activeOrder.paid_status === "Paid")) {
      return renderPaidButtons(); // Close + Clear
    }

    return renderDefaultButtons();
  };

  return (
    // Container: Removed "justify-between", added "gap-3"
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: s(8), paddingHorizontal: s(10), backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.border, gap: s(6) }}>
      <TouchableOpacity
        onPress={isMoreButtonDisabled ? undefined : onPressMore}
        activeOpacity={isMoreButtonDisabled ? 1 : 0.7}
        disabled={isMoreButtonDisabled}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: s(36), paddingHorizontal: s(12), borderRadius: s(8), gap: s(5), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: isMoreButtonDisabled ? 0.4 : 1 }}
      >
        <MoreHorizontal size={s(14)} color={isMoreButtonDisabled ? colors.muted : colors.label} />
        <Text style={{ fontSize: s(12), fontWeight: '600', color: isMoreButtonDisabled ? colors.muted : colors.label }}>More</Text>
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
    prev.onPressCloseCheck === next.onPressCloseCheck &&
    prev.onPressReopenCheck === next.onPressReopenCheck &&
    prev.onPressClearTable === next.onPressClearTable &&
    prev.onPressDiscount === next.onPressDiscount &&
    prev.activeOrder?.id === next.activeOrder?.id &&
    prev.activeOrder?.paid_status === next.activeOrder?.paid_status &&
    prev.activeOrder?.check_status === next.activeOrder?.check_status &&
    prev.activeOrder?.reopen_count === next.activeOrder?.reopen_count &&
    prev.activeOrder?.order_status === next.activeOrder?.order_status
  );
});