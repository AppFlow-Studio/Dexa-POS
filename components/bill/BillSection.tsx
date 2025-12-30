import { useToast } from "@/contexts/ToastContext";
import { CartItem } from "@/lib/types";
import { useDineInStore } from "@/stores/useDineInStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { AlertTriangle, Plus, RefreshCw, Send, WifiOff } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountBottomSheet from "./DiscountBottomSheet";
import DiscountOverlay from "./DiscountOverlay";
import OrderDetails from "./OrderDetails";
import Totals from "./Totals";

const BillSectionContent = ({ cart }: { cart: CartItem[] }) => {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

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
};

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
  const ordersById = useOrderStore((state) => state.ordersById);
  const activeOrderTotal = useOrderStore((state) => state.activeOrderTotal);
  const activeOrderOutstandingTotal = useOrderStore((state) => state.activeOrderOutstandingTotal);
  const activeOrderOutstandingCash = useOrderStore((state) => state.activeOrderOutstandingCash);
  const startNewOrder = useOrderStore((state) => state.startNewOrder);
  const sendNewItemsToKitchen = useOrderStore((state) => state.sendNewItemsToKitchen);
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

  // O(1) lookup instead of O(n) find
  const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;

  // Memoize computed values to prevent unnecessary recalculations
  const cart = useMemo(() => activeOrder?.items || [], [activeOrder?.items]);
  const hasDraftItems = useMemo(
    () => cart.some((item) => item.isDraft),
    [cart]
  );
  const newItemsCount = useMemo(
    () =>
      cart.filter(
        (item) => item.kitchen_status === "new" || !item.kitchen_status
      ).length,
    [cart]
  );

  // Get sync status for the active order
  const syncStatus = useMemo(
    () => (activeOrderId ? getSyncStatus(activeOrderId) : { pending: 0, failed: 0, synced: 0 }),
    [activeOrderId, getSyncStatus, cart] // Include cart to recompute when items change
  );
  const hasPendingSyncs = syncStatus.pending > 0;
  const hasFailedSyncs = syncStatus.failed > 0;

  // Calculate the amount to display on the Pay button
  // Priority: backend amount_due > calculated outstanding total > total
  const displayBalanceDue = useMemo(() => {
    // 1. Use backend's authoritative amount_due if available
    if (activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0) {
      return activeOrder.amount_due;
    }
    // 2. Use calculated outstanding total if there are payments
    if (activeOrder?.payments && activeOrder.payments.length > 0 && activeOrderOutstandingTotal > 0) {
      return activeOrderOutstandingTotal;
    }
    // 3. Fall back to full order total for new orders
    return activeOrderTotal;
  }, [activeOrder?.amount_due, activeOrder?.payments, activeOrderOutstandingTotal, activeOrderTotal]);

  // Check if order is partially paid (has payments but not fully paid)
  const isPartiallyPaid = useMemo(() => {
    return (activeOrder?.payments?.length ?? 0) > 0 && activeOrder?.paid_status !== "Paid";
  }, [activeOrder?.payments, activeOrder?.paid_status]);

  // Calculate cash savings for dual-price display
  const { cashBalanceDue, cashSavings } = useMemo(() => {
    // Use backend cash_amount_due if available, otherwise use local calculation
    const cashDue = activeOrder?.cash_amount_due ?? activeOrderOutstandingCash ?? displayBalanceDue;
    const savings = displayBalanceDue - cashDue;
    return {
      cashBalanceDue: cashDue,
      cashSavings: savings > 0.01 ? savings : 0,
    };
  }, [activeOrder?.cash_amount_due, activeOrderOutstandingCash, displayBalanceDue]);

  // Memoize pay button disabled state - prevents clicking when balance due is 0 or no items
  const isPayButtonDisabled = useMemo(
    () =>
      !activeOrder ||
      cart.length === 0 ||
      hasDraftItems ||
      displayBalanceDue <= 0,
    [activeOrder, cart.length, hasDraftItems, displayBalanceDue]
  );
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);

  const handleOpenDiscounts = () => {
    setDiscountOverlayVisible(true);
  };

  const handleCloseDiscounts = () => {
    setDiscountOverlayVisible(false);
  };

  const handleOpenMoreOptions = () => {
    moreOptionsSheetRef?.current?.expand();
  };

  const handlePayClick = () => {
    // Safety guard: Prevent payment if button should be disabled
    if (isPayButtonDisabled) {
      return;
    }
    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall();
      return;
    }
    if (hasDraftItems) {
      show({
        title: "Unconfirmed Items",
        message:
          "Please confirm or remove any customized items before proceeding to payment.",
        type: "error",
      });
      return;
    }
    // Additional safety check for zero balance due
    if (displayBalanceDue <= 0) {
      show({
        title: "Invalid Amount",
        message: activeOrder?.paid_status === "Paid"
          ? "This order is already fully paid."
          : "Cannot process payment for $0.00. Please add items to the order.",
        type: "error",
      });
      return;
    }
    // Directly open the payment bottom sheet to the method selection
    usePaymentStore.getState().open("Card", null, "payment-method-selection");
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

  const handleStartNewOrder = () => {
    const newOrder = startNewOrder();
    setActiveOrder(newOrder.id);
  };


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
                Offline Mode {pendingSyncCount > 0 ? `• ${pendingSyncCount} pending` : ""}
              </Text>
            </View>
          )}

          {/* Failed Syncs Banner (only when online) */}
          {isOnline && hasFailedSyncs && (
            <TouchableOpacity
              onPress={handleRetryFailedSyncs}
              className="flex-row items-center justify-between bg-red-600/80 px-3 py-2 rounded-lg"
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                <AlertTriangle size={16} color="#FFFFFF" />
                <Text className="text-white text-sm font-medium ml-2">
                  {syncStatus.failed} item{syncStatus.failed > 1 ? "s" : ""} failed to sync
                </Text>
              </View>
              <View className="flex-row items-center">
                <RefreshCw size={14} color="#FFFFFF" />
                <Text className="text-white text-xs ml-1">Retry</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Syncing Indicator (only when online and syncing) */}
          {isOnline && !hasFailedSyncs && hasPendingSyncs && (
            <View className="flex-row items-center justify-center bg-blue-600/60 px-3 py-2 rounded-lg">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="text-white text-sm font-medium ml-2">
                Syncing {syncStatus.pending} item{syncStatus.pending > 1 ? "s" : ""}...
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
            className="flex-1 py-2 flex-row items-center justify-center gap-2 bg-[#303030] rounded-xl border border-gray-600"
          >
            <Plus color="#22c55e" size={20} />
            <Text className="text-center text-xl font-bold text-white">
              New Order
            </Text>
          </TouchableOpacity>

          {/* Send to Kitchen Button - matching previous colors but with new layout */}
          <TouchableOpacity
            className={`flex-1 py-2 px-2 flex-row items-center justify-center gap-2 rounded-xl bg-[#212121] border border-gray-600 ${newItemsCount === 0 || hasDraftItems ? "opacity-50" : ""
              }`}
            disabled={newItemsCount === 0 || hasDraftItems}
            onPress={handleSendToKitchen}
            activeOpacity={0.85}
          >
            {hasPendingSyncs ? (
              <ActivityIndicator size="small" color="#60A5FA" />
            ) : null}
            <Text className="text-center text-xl font-bold text-white">
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
              className="flex-1 py-2 bg-[#303030] rounded-xl border border-gray-600"
            >
              <Text className="text-center text-xl font-bold text-white">
                More
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePayClick}
              disabled={isPayButtonDisabled}
              className={`flex-1 py-2 rounded-xl flex-row items-center justify-center gap-2 ${isPayButtonDisabled ? "bg-gray-500" : isPartiallyPaid ? "bg-green-600" : "bg-blue-600"
                }`}
            >
              {hasPendingSyncs ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : null}
              <Text
                className={`text-center text-xl font-bold ${isPayButtonDisabled ? "text-gray-400" : "text-white"
                  }`}
              >
                {isPartiallyPaid ? `Pay Due $${displayBalanceDue.toFixed(2)}` : `Pay $${displayBalanceDue.toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Cash Discount Option */}
          {/* {cashSavings > 0 && displayBalanceDue > 0 && (
            <View className="mt-2 px-2 py-1.5 bg-green-900/20 rounded-lg border border-green-600/30">
              <Text className="text-center text-sm text-green-400">
                Pay cash: ${cashBalanceDue.toFixed(2)} (save ${cashSavings.toFixed(2)})
              </Text>
            </View>
          )} */}
          <View className="mt-2 px-2 py-1.5 bg-green-900/20 rounded-lg border border-green-600/30">
            <Text className="text-center text-sm text-green-400">
              Pay cash: ${cashBalanceDue?.toFixed(2)} (save ${cashSavings?.toFixed(2)})
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
