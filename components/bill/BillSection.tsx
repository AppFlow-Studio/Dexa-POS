import { useToast } from "@/contexts/ToastContext";
import { CartItem } from "@/lib/types";
import { colors } from "@/lib/theme";
import {
  getAutoRetryCount,
  getDeadLetterCount,
  isAutoRetryInProgress,
} from "@/services/offlineSyncService";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { PrinterService } from "@/services/printing/PrinterService";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useDineInStore } from "@/stores/useDineInStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useOrderSyncCounts } from "@/stores/useSyncStatusStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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
import { useShallow } from "zustand/react/shallow";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountBottomSheet from "./DiscountBottomSheet";
import DiscountOverlay from "./DiscountOverlay";
import OrderDetails from "./OrderDetails";
import Totals from "./Totals";

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const BillItemsAndTotals = React.memo(
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

const BillSectionContent = ({
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
  // O(1) lookups - single shallow selector reduces subscription overhead
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const {
    activeOrderItems,
    activeOrderPayments,
    activeOrderPaidStatus,
    activeOrderType,
    activeOrderServiceLocation,
  } = useOrderStore(
    useShallow((s) => {
      const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
      return {
        activeOrderItems: order?.items ?? null,
        activeOrderPayments: order?.payments ?? null,
        activeOrderPaidStatus: order?.paid_status ?? null,
        activeOrderType: order?.order_type ?? null,
        activeOrderServiceLocation: order?.service_location_id ?? null,
      };
    })
  );

  // Phase 7: Use derived selector instead of 3 individual store selectors
  const orderTotals = useActiveOrderTotals();

  const {
    startNewOrder,
    sendNewItemsToKitchen,
    assignOrderToTable,
    setActiveOrder,
    retryFailedSyncs,
  } = useOrderStore(
    useShallow((s) => ({
      startNewOrder: s.startNewOrder,
      sendNewItemsToKitchen: s.sendNewItemsToKitchen,
      assignOrderToTable: s.assignOrderToTable,
      setActiveOrder: s.setActiveOrder,
      retryFailedSyncs: s.retryFailedSyncs,
    }))
  );

  // Offline sync state — subscribe directly to offlineSyncService for reliable updates
  const { isOnline, pendingSyncCount } = useNetworkStatus();

  const { selectedTable, clearSelectedTable } = useDineInStore();
  const { activeEmployeeId } = useEmployeeStore();
  const { checkEmployeeInShift, showClockInWall } = useTimeclockStore();
  const { show } = useToast();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const autoPrintKitchenTickets = useLocationConfigStore((s) => s.config.printing.autoPrintKitchenTickets);

  // Memoize computed values to prevent unnecessary recalculations
  const cart = useMemo(() => activeOrderItems || [], [activeOrderItems]);
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

  // Get sync counts for the active order's non-draft items.
  // useOrderSyncCounts only re-renders BillSection when the actual counts change,
  // not on every individual item sync status transition.
  const nonDraftItemIds = useMemo(
    () => cart.filter((item) => !item.isDraft).map((item) => item.id),
    [cart]
  );
  const syncStatus = useOrderSyncCounts(nonDraftItemIds);
  const hasPendingSyncs = syncStatus.pending > 0;
  const hasFailedSyncs = syncStatus.failed > 0;

  // Track dead-letter count for banner warning
  const [deadLetterCount, setDeadLetterCount] = useState(0);

  // Track auto-retry state for UI indicator
  const [autoRetryState, setAutoRetryState] = useState({
    isRetrying: false,
    count: 0,
  });

  // Poll for auto-retry status when there are failed syncs
  useEffect(() => {
    if (!hasFailedSyncs && !hasPendingSyncs) {
      setAutoRetryState((prev) =>
        prev.isRetrying || prev.count !== 0
          ? { isRetrying: false, count: 0 }
          : prev,
      );
      return;
    }

    // Check auto-retry status periodically
    const checkAutoRetry = () => {
      const isRetrying = isAutoRetryInProgress();
      const count = getAutoRetryCount();
      setAutoRetryState((prev) =>
        prev.isRetrying === isRetrying && prev.count === count
          ? prev
          : { isRetrying, count },
      );
    };

    checkAutoRetry();
    const interval = setInterval(checkAutoRetry, 5000); // PERF: 5s - informational, not action-critical

    return () => clearInterval(interval);
  }, [hasFailedSyncs, hasPendingSyncs]);

  // Poll dead-letter count (low frequency — informational only)
  useEffect(() => {
    const check = () => setDeadLetterCount(getDeadLetterCount());
    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Calculate the amount to display on the Pay button
  // Phase 7: Now uses derived selector which already prioritizes backend values
  const displayBalanceDue = useMemo(() => {
    if (!orderTotals) return 0;

    // Derived selector's amountDue already prioritizes backend amount_due
    // For new orders without payments, use total
    if (!activeOrderPayments?.length) {
      return orderTotals.total;
    }

    return orderTotals.amountDue;
  }, [orderTotals, activeOrderPayments]);

  // Check if order is partially paid (has payments but not fully paid)
  const isPartiallyPaid = useMemo(() => {
    const hasPayments = (activeOrderPayments?.length ?? 0) > 0;
    const hasDue = (orderTotals?.amountDue ?? 0) > 0.01;
    return hasPayments && (activeOrderPaidStatus !== "Paid" || hasDue);
  }, [activeOrderPayments, activeOrderPaidStatus, orderTotals?.amountDue]);

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
      !activeOrderId ||
      cart.length === 0 ||
      displayBalanceDue <= 0 ||
      isProcessing,
    [activeOrderId, cart.length, displayBalanceDue, isProcessing],
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
          activeOrderPaidStatus === "Paid"
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
        activeOrderServiceLocation || null,
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

    // Capture new items BEFORE sendNewItemsToKitchen (which merges/mutates statuses)
    const currentOrder = activeOrderId
      ? useOrderStore.getState().ordersById[activeOrderId]
      : null;
    const newItems = currentOrder?.items.filter(
      (item) => !item.kitchen_status || item.kitchen_status === "new",
    ) || [];

    if (activeOrderType === "dine_in" && selectedTable) {
      assignOrderToTable(activeOrderId!, selectedTable.id);
      // Table session status updates are now handled through session-based APIs
      clearSelectedTable();
    }
    sendNewItemsToKitchen();

    // Auto-print kitchen tickets for new items
    if (autoPrintKitchenTickets && selectedStore && newItems.length > 0 && currentOrder) {
      PrinterService.printKitchenTickets(currentOrder, newItems, selectedStore)
        .catch((e) => console.warn("[BillSection] Auto-print kitchen tickets failed:", e));
    }
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
      <View className="w-1/3 items-center justify-center p-6 bg-background">
        <Text className="text-sm font-semibold text-white mb-3">
          No Active Order
        </Text>
        <TouchableOpacity
          className="px-4 py-2 bg-teal-600 rounded-lg active:opacity-80"
          onPress={() => { startNewOrder(); }}
        >
          <Text className="text-white text-sm font-semibold">
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
    <View className="w-1/3 bg-screen border-r-2 border-border " >
      {showOrderDetails && <OrderDetails />}

      {/* Offline / Sync Status Banner */}
      {(!isOnline || hasFailedSyncs || pendingSyncCount > 0 || deadLetterCount > 0) && (
        <View className="px-3 py-1.5 gap-y-1" style={{ backgroundColor: colors.background }}>
          {deadLetterCount > 0 && (
            <View className="flex-row items-center justify-center bg-orange-700/80 px-2.5 py-1.5 rounded-md">
              <AlertTriangle size={12} color="#FFFFFF" />
              <Text className="text-white font-medium ml-1.5" style={{ fontSize: 11 }}>
                {deadLetterCount} operation{deadLetterCount > 1 ? "s" : ""} need attention — go to Settings
              </Text>
            </View>
          )}

          {!isOnline && (
            <View className="flex-row items-center justify-center bg-amber-600 px-2.5 py-1.5 rounded-md">
              <WifiOff size={12} color="#FFFFFF" />
              <Text className="text-white font-medium ml-1.5" style={{ fontSize: 11 }}>
                Offline Mode{pendingSyncCount > 0 ? ` • ${pendingSyncCount} pending` : ""}
              </Text>
            </View>
          )}

          {isOnline && hasFailedSyncs && (
            <TouchableOpacity
              onPress={handleRetryFailedSyncs}
              disabled={autoRetryState.isRetrying}
              className={`flex-row items-center justify-between px-2.5 py-1.5 rounded-md ${
                autoRetryState.isRetrying ? "bg-amber-600/80" : "bg-red-600/80"
              }`}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                {autoRetryState.isRetrying ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text className="text-white font-medium ml-1.5" style={{ fontSize: 11 }}>
                      Retrying {autoRetryState.count} op{autoRetryState.count > 1 ? "s" : ""}...
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} color="#FFFFFF" />
                    <Text className="text-white font-medium ml-1.5" style={{ fontSize: 11 }}>
                      {syncStatus.failed} failed to sync
                    </Text>
                  </>
                )}
              </View>
              {!autoRetryState.isRetrying && (
                <View className="flex-row items-center">
                  <RefreshCw size={11} color="#FFFFFF" />
                  <Text className="text-white ml-1" style={{ fontSize: 10 }}>Retry</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {isOnline && !hasFailedSyncs && activeOrderPayments?.some((p) => p.sync_status === "pending") && (
            <View className="flex-row items-center justify-center bg-amber-600/70 px-2.5 py-1.5 rounded-md">
              <Clock size={12} color="#FFFFFF" />
              <Text className="text-white font-medium ml-1.5" style={{ fontSize: 11 }}>
                Payment syncing...
              </Text>
            </View>
          )}

          {isOnline && !hasFailedSyncs && hasPendingSyncs && (
            <View className="flex-row items-center justify-center bg-teal-600/60 px-2.5 py-1.5 rounded-md">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="text-white font-medium ml-1.5" style={{ fontSize: 11 }}>
                Syncing {syncStatus.pending} item{syncStatus.pending > 1 ? "s" : ""}...
              </Text>
            </View>
          )}
        </View>
      )}

      <BillItemsAndTotals cart={cart} />
      <View className="py-1.5 px-3">
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleStartNewOrder}
            className="w-1/3 py-1.5 px-2 flex-row items-center justify-center gap-1 rounded-lg border shrink-0"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <Plus color={"#FFFFFF"} size={14} />
            <Text className="text-center text-xs font-semibold text-white">
              New Order
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`flex-1 py-1.5 px-2 flex-row items-center justify-center gap-1.5 rounded-lg border ${
              newItemsCount === 0 || hasDraftItems ? "opacity-40" : ""
            }`}
            style={{
              backgroundColor: newItemsCount === 0 || hasDraftItems ? colors.panel : colors.card,
              borderColor: colors.border,
            }}
            disabled={newItemsCount === 0 || hasDraftItems}
            onPress={handleSendToKitchen}
            activeOpacity={1}
          >
            <Text className="text-center text-xs font-semibold text-white">
              Send to Kitchen
            </Text>
            <View className="rounded-full bg-teal-400 w-4 h-4 items-center justify-center">
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.onSolid, lineHeight: 12 }}>
                {newItemsCount}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
      {showPlaymentActions && (
        <View className="px-3 pt-1 pb-2.5">
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={handleOpenMoreOptions}
              disabled={!activeOrderId || (activeOrderItems?.length ?? 0) === 0}
              className="w-1/3 h-11 items-center justify-center rounded-lg border shrink-0"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: !activeOrderId || (activeOrderItems?.length ?? 0) === 0 ? 0.4 : 1,
              }}
            >
              <Text className="text-center text-base font-bold text-white leading-none mb-0.5">···</Text>
              <Text className="text-center" style={{ fontSize: 10, fontWeight: "600", color: "#FFFFFF" }}>More</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePayClick}
              disabled={isPayButtonDisabled}
              className={`flex-1 h-11 rounded-lg flex-row items-center justify-center gap-1.5 ${
                isPayButtonDisabled
                  ? "bg-gray-600"
                  : isPartiallyPaid
                    ? "bg-teal-400"
                    : "bg-teal-400"
              }`}
            >
              {hasPendingSyncs || isProcessing ? (
                <ActivityIndicator size={12} color="#FFFFFF" />
              ) : null}
              <Text
                style={{ fontSize: 13, fontWeight: "700" }}
                className={isPayButtonDisabled ? "text-gray-400" : "text-black"}
              >
                {isPartiallyPaid
                  ? `Pay Due $${displayBalanceDue.toFixed(2)}`
                  : `Pay $${displayBalanceDue.toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          </View>
          {cashSavings > 0 && (
            <View className="mt-1.5 self-center px-2 py-1 bg-transparent rounded-2xl border border-teal-600/30">
              <Text style={{ fontSize: 10 }} className="text-teal">
                Cash: ${cashBalanceDue?.toFixed(2)} · save ${cashSavings?.toFixed(2)}
              </Text>
            </View>
          )}
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

const BillSection = React.memo(BillSectionContent);
export default BillSection;
