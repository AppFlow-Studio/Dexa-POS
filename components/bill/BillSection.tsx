import { useToast } from "@/contexts/ToastContext";
import { CartItem } from "@/lib/types";
import {
  getAutoRetryCount,
  isAutoRetryInProgress,
} from "@/services/offlineSyncService";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useDineInStore } from "@/stores/useDineInStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import {
  AlertTriangle,
  Clock,
  Plus,
  RefreshCw,
  Send,
  WifiOff,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountBottomSheet from "./DiscountBottomSheet";
import DiscountOverlay from "./DiscountOverlay";
import OrderDetails from "./OrderDetails";
import Totals from "./Totals";

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const BillSectionContent = React.memo(
  ({ cart }: { cart: CartItem[] }) => {
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

    const handleToggleExpand = useCallback((itemId: string) => {
      setExpandedItemId((prev) => (prev === itemId ? null : itemId));
    }, []);

    return (
      <>
        <BillSummary
          cart={cart}
          expandedItemId={expandedItemId}
          onToggleExpand={handleToggleExpand}
        />
        <Totals cart={cart} />
      </>
    );
  },
  (prev, next) => prev.cart === next.cart,
);

const BillSection = ({
  showOrderDetails = true,
  showPlaymentActions = true,
  moreOptionsSheetRef,
  discountSheetRef,
}: {
  showOrderDetails?: boolean;
  showPlaymentActions?: boolean;
  moreOptionsSheetRef?: React.RefObject<BottomSheetMethods>;
  discountSheetRef?: React.RefObject<BottomSheetMethods>;
}) => {
  // O(1) lookups with individual selectors - only re-renders when specific values change
  const activeOrderId = useOrderStore((state) => state.activeOrderId);

  // FIXED: Only subscribe to the active order, not the entire ordersById object
  const activeOrder = useOrderStore((state) =>
    state.activeOrderId ? state.ordersById[state.activeOrderId] : undefined,
  );

  // Phase 7: Use derived selector instead of 3 individual store selectors
  const orderTotals = useActiveOrderTotals();

  const startNewOrder = useOrderStore((state) => state.startNewOrder);
  const sendNewItemsToKitchen = useOrderStore(
    (state) => state.sendNewItemsToKitchen,
  );
  const assignOrderToTable = useOrderStore((state) => state.assignOrderToTable);
  const setActiveOrder = useOrderStore((state) => state.setActiveOrder);
  const getSyncStatus = useOrderStore((state) => state.getSyncStatus);
  const retryFailedSyncs = useOrderStore((state) => state.retryFailedSyncs);

  // Offline sync state
  const isOnline = useOrderStore((state) => state.isOnline);
  const pendingSyncCount = useOrderStore((state) => state.pendingSyncCount);

  const { selectedTable, clearSelectedTable } = useDineInStore();
  const { activeEmployeeId } = useEmployeeStore();
  const { checkEmployeeInShift, showClockInWall } = useTimeclockStore();
  const { show } = useToast();

  // Memoize computed values to prevent unnecessary recalculations
  const cart = useMemo(() => activeOrder?.items || [], [activeOrder?.items]);
  const hasDraftItems = useMemo(
    () => cart.some((item) => item.isDraft),
    [cart],
  );
  const newItemsCount = useMemo(
    () =>
      cart.filter(
        (item) => item.kitchen_status === "new" || !item.kitchen_status,
      ).length,
    [cart],
  );

  // Get sync status for the active order
  const syncStatus = useMemo(
    () =>
      activeOrderId
        ? getSyncStatus(activeOrderId)
        : { pending: 0, failed: 0, synced: 0 },
    [activeOrderId, getSyncStatus, cart], // Include cart to recompute when items change
  );
  const hasPendingSyncs = syncStatus.pending > 0;
  const hasFailedSyncs = syncStatus.failed > 0;

  // Track auto-retry state for UI indicator
  const [autoRetryState, setAutoRetryState] = useState({
    isRetrying: false,
    count: 0,
  });

  // Poll for auto-retry status when there are failed syncs
  useEffect(() => {
    if (!hasFailedSyncs && !hasPendingSyncs) {
      setAutoRetryState({ isRetrying: false, count: 0 });
      return;
    }

    // Check auto-retry status periodically
    const checkAutoRetry = () => {
      setAutoRetryState({
        isRetrying: isAutoRetryInProgress(),
        count: getAutoRetryCount(),
      });
    };

    checkAutoRetry();
    const interval = setInterval(checkAutoRetry, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [hasFailedSyncs, hasPendingSyncs, syncStatus]);

  // Calculate the amount to display on the Pay button
  // Phase 7: Now uses derived selector which already prioritizes backend values
  const displayBalanceDue = useMemo(() => {
    if (!orderTotals) return 0;

    // Derived selector's amountDue already prioritizes backend amount_due
    // For new orders without payments, use total
    if (!activeOrder?.payments?.length) {
      return orderTotals.total;
    }

    return orderTotals.amountDue;
  }, [orderTotals, activeOrder?.payments]);

  // Check if order is partially paid (has payments but not fully paid)
  const isPartiallyPaid = useMemo(() => {
    const hasPayments = (activeOrder?.payments?.length ?? 0) > 0;
    const hasDue = (orderTotals?.amountDue ?? 0) > 0.01;
    return hasPayments && (activeOrder?.paid_status !== "Paid" || hasDue);
  }, [activeOrder?.payments, activeOrder?.paid_status, orderTotals?.amountDue]);

  // Calculate cash savings for dual-price display
  // Phase 7: Now uses derived selector which already prioritizes backend values
  // console.log("orderTotals", orderTotals);
  const { cashBalanceDue, cashSavings } = useMemo(() => {
    if (!orderTotals) {
      return { cashBalanceDue: 0, cashSavings: 0 };
    }

    // if (!activeOrder?.payments?.length) {
    //   return { cashBalanceDue: orderTotals.cashAmountDue, cashSavings: 0 };
    // }
    // Derived selector's cashAmountDue already prioritizes backend cash_amount_due
    const cashDue = orderTotals.cashAmountDue;
    const savings = displayBalanceDue - cashDue;
    return {
      cashBalanceDue: cashDue,
      cashSavings: savings > 0.01 ? savings : 0,
    };
  }, [orderTotals, displayBalanceDue]);

  const [isProcessing, setIsProcessing] = useState(false);
  const isPaymentSheetOpen = usePaymentStore((state) => state.isOpen);

  // Effect to reset processing state when payment sheet opens
  useEffect(() => {
    if (isPaymentSheetOpen) {
      setIsProcessing(false);
    }
  }, [isPaymentSheetOpen]);

  // Memoize pay button disabled state - prevents clicking when balance due is 0 or no items
  const isPayButtonDisabled = useMemo(
    () =>
      !activeOrder ||
      cart.length === 0 ||
      displayBalanceDue <= 0 ||
      isProcessing,
    [
      activeOrder,
      cart.length,
      hasDraftItems,
      displayBalanceDue,
      isPaymentSheetOpen,
      isProcessing,
    ],
  );
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);
  // OPTIMIZED: Wrap callbacks with useCallback to prevent recreation on each render
  const handleOpenDiscounts = useCallback(() => {
    setDiscountOverlayVisible(true);
  }, []);

  const handleCloseDiscounts = useCallback(() => {
    setDiscountOverlayVisible(false);
  }, []);

  const handleOpenMoreOptions = useCallback(() => {
    moreOptionsSheetRef?.current?.expand();
  }, [moreOptionsSheetRef]);

  const handlePayClick = () => {
    // Safety guard: Prevent payment if button should be disabled
    if (isPayButtonDisabled || isProcessing) {
      return;
    }

    // Set processing state immediately to prevent double taps
    setIsProcessing(true);

    // Failsafe: Reset processing state after 2 seconds if sheet fails to open
    setTimeout(() => {
      setIsProcessing(false);
    }, 2000);

    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall();
      setIsProcessing(false);
      return;
    }
    if (hasDraftItems) {
      show({
        title: "Unconfirmed Items",
        message:
          "Please confirm or remove any customized items before proceeding to payment.",
        type: "error",
      });
      setIsProcessing(false);
      return;
    }
    // Additional safety check for zero balance due
    if (displayBalanceDue <= 0) {
      show({
        title: "Invalid Amount",
        message:
          activeOrder?.paid_status === "Paid"
            ? "This order is already fully paid."
            : "Cannot process payment for $0.00. Please add items to the order.",
        type: "error",
      });
      setIsProcessing(false);
      return;
    }
    // Directly open the payment bottom sheet to the method selection
    usePaymentStore
      .getState()
      .open(
        "Card",
        activeOrder?.service_location_id || null,
        "payment-method-selection",
      );
  };

  const handleSendToKitchen = () => {
    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall();
      return;
    }
    if (hasDraftItems) {
      show({
        title: "Unconfirmed Items",
        message:
          "Please confirm or remove any customized items before sending the order to the kitchen.",
        type: "error",
      });
      return;
    }

    if (activeOrder?.order_type === "dine_in" && selectedTable) {
      assignOrderToTable(activeOrderId!, selectedTable.id);
      // Table session status updates are now handled through session-based APIs
      clearSelectedTable();
    }
    sendNewItemsToKitchen();
    const newOrder = startNewOrder();
    setActiveOrder(newOrder.id);
  };

  // OPTIMIZED: Wrap callback with useCallback
  // Reuse existing empty draft order if one exists (prevents inflating order counts)
  const handleStartNewOrder = useCallback(() => {
    // Check if there's already an empty draft order (not synced to backend)
    const ordersById = useOrderStore.getState().ordersById;
    const existingEmptyDraft = Object.values(ordersById).find(
      (o) =>
        !o.db_order_id && // Not synced to backend
        o.order_status === "draft" &&
        o.items.length === 0 &&
        o.service_location_id === null, // Not assigned to a table
    );

    if (existingEmptyDraft) {
      // Reuse existing empty draft
      setActiveOrder(existingEmptyDraft.id);
    } else {
      // Create new order only if no reusable draft exists
      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);
    }
  }, [startNewOrder, setActiveOrder]);

  if (!activeOrderId)
    return (
      <View className="w-1/3 items-center justify-center bg-[#212121] p-8 ">
        <Text className="text-xl font-semibold text-white mb-4">
          No Active Order
        </Text>
        <TouchableOpacity
          className="px-6 py-3 bg-blue-600 rounded-lg shadow-md active:opacity-80"
          onPress={() => {
            startNewOrder();
          }}
        >
          <Text className="text-white text-xl font-bold tracking-wide">
            Start New Order
          </Text>
        </TouchableOpacity>
      </View>
    );
  // Handle retry failed syncs
  const handleRetryFailedSyncs = async () => {
    if (activeOrderId) {
      await retryFailedSyncs(activeOrderId);
    }
  };

  return (
    <View className="w-1/3 bg-[#303030]">
      {showOrderDetails && <OrderDetails />}

      {/* Offline / Sync Status Banner */}
      {(!isOnline || hasFailedSyncs || pendingSyncCount > 0) && (
        <View className="px-4 py-2 bg-[#212121]">
          {/* Offline Mode Banner */}
          {!isOnline && (
            <View className="flex-row items-center justify-center bg-amber-600 px-3 py-2 rounded-lg mb-2">
              <WifiOff size={16} color="#FFFFFF" />
              <Text className="text-white text-sm font-medium ml-2">
                Offline Mode{" "}
                {pendingSyncCount > 0 ? `• ${pendingSyncCount} pending` : ""}
              </Text>
            </View>
          )}

          {/* Failed Syncs Banner with Auto-Retry Indicator (only when online) */}
          {isOnline && hasFailedSyncs && (
            <TouchableOpacity
              onPress={handleRetryFailedSyncs}
              disabled={autoRetryState.isRetrying}
              className={`flex-row items-center justify-between px-3 py-2 rounded-lg ${
                autoRetryState.isRetrying ? "bg-amber-600/80" : "bg-red-600/80"
              }`}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                {autoRetryState.isRetrying ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text className="text-white text-sm font-medium ml-2">
                      Auto-retrying {autoRetryState.count} operation
                      {autoRetryState.count > 1 ? "s" : ""}...
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} color="#FFFFFF" />
                    <Text className="text-white text-sm font-medium ml-2">
                      {syncStatus.failed} item{syncStatus.failed > 1 ? "s" : ""}{" "}
                      failed to sync
                    </Text>
                  </>
                )}
                <AlertTriangle size={16} color="#FFFFFF" />
                <Text className="text-white text-sm font-medium ml-2">
                  {syncStatus.failed} item{syncStatus.failed > 1 ? "s" : ""}{" "}
                  failed to sync
                </Text>
              </View>
              <View className="flex-row items-center">
                <RefreshCw size={14} color="#FFFFFF" />
                <Text className="text-white text-xs ml-1">Retry</Text>
              </View>
              {!autoRetryState.isRetrying && (
                <View className="flex-row i tems-center">
                  <RefreshCw size={14} color="#FFFFFF" />
                  <Text className="text-white text-xs ml-1">Retry Now</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Pending Payment Syncs Banner (only when online and has pending payments) */}
          {isOnline &&
            !hasFailedSyncs &&
            activeOrder?.payments?.some((p) => p.sync_status === "pending") && (
              <View className="flex-row items-center justify-center bg-amber-600/70 px-3 py-2 rounded-lg">
                <Clock size={16} color="#FFFFFF" />
                <Text className="text-white text-sm font-medium ml-2">
                  Payment pending sync...
                </Text>
              </View>
            )}

          {/* Syncing Indicator (only when online and syncing) */}
          {isOnline && !hasFailedSyncs && hasPendingSyncs && (
            <View className="flex-row items-center justify-center bg-blue-600/60 px-3 py-2 rounded-lg">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="text-white text-sm font-medium ml-2">
                Syncing {syncStatus.pending} item
                {syncStatus.pending > 1 ? "s" : ""}...
              </Text>
            </View>
          )}
        </View>
      )}

      <BillSectionContent cart={cart} />
      <View className="py-3 px-4 bg-[#212121]">
        <View className="flex-row gap-4">
          {/* Start New Order Button */}
          <TouchableOpacity
            onPress={handleStartNewOrder}
            className="flex-1 py-1.5 flex-row items-center justify-center gap-2 bg-[#303030] rounded-xl border border-gray-600"
          >
            <Plus color="#22c55e" size={20} />
            <Text className="text-center text-lg font-bold text-white">
              New Order
            </Text>
          </TouchableOpacity>

          {/* Send to Kitchen Button - matching previous colors but with new layout */}
          <TouchableOpacity
            className={`flex-1 py-1.5 px-2 flex-row items-center justify-center gap-2 rounded-xl bg-[#212121] border border-gray-600 ${
              newItemsCount === 0 || hasDraftItems ? "opacity-50" : ""
            }`}
            disabled={newItemsCount === 0 || hasDraftItems}
            onPress={handleSendToKitchen}
            activeOpacity={0.85}
          >
            {hasPendingSyncs ? (
              <ActivityIndicator size={10} color="#60A5FA" />
            ) : null}
            <Text className="text-center text-lg font-bold text-white">
              Send to Kitchen ({newItemsCount})
            </Text>
            <Send size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
      <View className="bg-[#212121]">
        <View className="h-[0.5px] w-[90%] self-center bg-gray-600" />
      </View>
      {showPlaymentActions && (
        <View className="py-3 px-4 bg-[#212121]">
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={handleOpenMoreOptions}
              className="flex-1 py-1.5 bg-[#303030] rounded-xl border border-gray-600"
            >
              <Text className="text-center text-lg font-bold text-white">
                More
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePayClick}
              disabled={isPayButtonDisabled}
              className={`flex-1 py-1.5 rounded-xl flex-row items-center justify-center gap-2 ${
                isPayButtonDisabled
                  ? "bg-gray-500"
                  : isPartiallyPaid
                    ? "bg-green-600"
                    : "bg-blue-600"
              }`}
            >
              {hasPendingSyncs || isProcessing ? (
                <ActivityIndicator size={10} color="#FFFFFF" />
              ) : null}
              <Text
                className={`text-center text-lg font-bold ${
                  isPayButtonDisabled ? "text-gray-400" : "text-white"
                }`}
              >
                {isPartiallyPaid
                  ? `Pay Due $${displayBalanceDue.toFixed(2)}`
                  : `Pay $${displayBalanceDue.toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Cash Discount Option */}

          <View className="mt-2 px-2 py-1.5 bg-green-900/20 rounded-lg border border-green-600/30">
            <Text className="text-center text-sm text-green-400">
              Pay cash: ${cashBalanceDue?.toFixed(2)} (save $
              {cashSavings?.toFixed(2)})
            </Text>
          </View>
        </View>
      )}
      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
      <DiscountBottomSheet
        ref={discountSheetRef}
        onClose={() => discountSheetRef?.current?.close()}
      />
    </View>
  );
};

export default BillSection;
