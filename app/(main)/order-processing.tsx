import BillSection from "@/components/bill/BillSection";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import MenuSection from "@/components/menu/MenuSection";
import OrderBadge from "@/components/order/OrderBadge";
import OrderLineItemsModal from "@/components/order/OrderLineItemsModal";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { OrderProfile } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { PrinterService } from "@/services/printing/PrinterService";
import { useOrderLineFilteredOrders } from "@/stores/selectors/orderSelectors";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { getOrderStoreSupabaseClient, useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";

const EMPTY_ORDERS: OrderProfile[] = [];
const badgeContentStyle = { paddingHorizontal: 4, gap: 8 } as const;

const OrderProcessing = () => {
  // FIXED: Use individual selectors to prevent subscribing to entire ordersById
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const startNewOrder = useOrderStore((s) => s.startNewOrder);
  const markAllItemsAsReady = useOrderStore((s) => s.markAllItemsAsReady);
  const archiveOrder = useOrderStore((s) => s.archiveOrder);
  const updateOrderCheckStatus = useOrderStore((s) => s.updateOrderCheckStatus);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const daysToShow = useSettingsStore((s) => s.orderLineSettings.daysToShow);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // OPTIMIZED: Dedicated selector with useStableOrderList for referential stability
  const reversedFilteredOrders = useOrderLineFilteredOrders(daysToShow);

  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);
  const discountSheetRef = useRef<BottomSheetMethods>(null);

  // OPTIMIZED: Effect now uses getState() to avoid subscribing to all orders
  useEffect(() => {
    // Only run if activeOrderId is missing, or we need to validate it
    // access state directly without subscription
    const state = useOrderStore.getState();
    const ordersById = state.ordersById;
    const orderIds = state.orderIds;
    const allOrders = orderIds.map((id) => ordersById[id]).filter(Boolean);

    // Find drafts (O(N) search but only runs on mount/reset)
    const emptyDraft = allOrders.find(
      (o) =>
        o.service_location_id === null &&
        o.order_status === "draft" &&
        o.items.length === 0 &&
        o.paid_status !== "Paid",
    );

    const globalDraft = allOrders.find(
      (o) =>
        o.service_location_id === null &&
        o.order_status === "draft" &&
        o.paid_status !== "Paid",
    );

    if (!activeOrderId) {
      if (emptyDraft) {
        setActiveOrder(emptyDraft.id);
      } else if (globalDraft) {
        setActiveOrder(globalDraft.id);
      } else {
        const newOrder = startNewOrder();
        setActiveOrder(newOrder.id);
      }
      return;
    }

    // Verify current active order exists
    const currentActive = ordersById[activeOrderId];
    if (!currentActive) {
      if (emptyDraft) {
        setActiveOrder(emptyDraft.id);
      } else if (globalDraft) {
        setActiveOrder(globalDraft.id);
      } else {
        const newOrder = startNewOrder();
        setActiveOrder(newOrder.id);
      }
    }
  }, [activeOrderId, setActiveOrder, startNewOrder]);

  const handleViewItems = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setItemsModalOpen(true);
  }, []);

  const handleMarkReady = useCallback((order: OrderProfile) => {
    markAllItemsAsReady(order.id);
    // Don't auto-archive paid orders — cashier must explicitly mark done
  }, [markAllItemsAsReady]);

  const handleMarkDone = useCallback((orderId: string) => {
    archiveOrder(orderId);
  }, [archiveOrder]);

  const handleRetrieve = useCallback((orderId: string) => {
    setActiveOrder(orderId);
  }, [setActiveOrder]);

  const handleReopenCheck = useCallback((orderId: string) => {
    updateOrderCheckStatus(orderId, "Opened");
    setActiveOrder(orderId);
  }, [updateOrderCheckStatus, setActiveOrder]);

  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();

  const handlePrintReceipt = useCallback(
    async (order: OrderProfile) => {
      if (!selectedStore) {
        show({ title: "Print Error", message: "No store location selected.", type: "error" });
        return;
      }
      await PrinterService.printReceipt(order, selectedStore);
    },
    [selectedStore, show],
  );

  const handleCloseCheck = useCallback(async () => {
    const state = useOrderStore.getState();
    const currentActiveOrderId = state.activeOrderId;
    const currentActiveOrder = currentActiveOrderId ? state.ordersById[currentActiveOrderId] : null;

    if (!currentActiveOrderId || !currentActiveOrder) return;

    // Validate order has backend ID
    if (!currentActiveOrder.db_order_id) {
      show({
        title: "Cannot Close Check",
        message: "Order must be synced to close check",
        type: "error",
      });
      return;
    }

    // Optimistic update — instant UI feedback
    updateActiveOrderDetails({ check_status: "Closed" });
    showLoading("Closing check...");

    try {
      const supabase = getOrderStoreSupabaseClient();
      const { loggedInEmployee } = useEmployeeStore.getState();

      if (!supabase) {
        throw new Error("Database connection unavailable");
      }

      const result = await OrderService.closeCheck(
        supabase,
        currentActiveOrder.db_order_id,
        loggedInEmployee?.profileId || null,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to close check");
      }

      hideLoading();
      show({
        title: "Check Closed",
        message: "The check has been finalized. You can now clear the table.",
        type: "success",
      });
    } catch (error: any) {
      console.error("Failed to close check:", error);
      // Rollback optimistic update
      updateActiveOrderDetails({ check_status: "Opened" });
      hideLoading();
      show({
        title: "Failed to Close Check",
        message: error.message || "An error occurred",
        type: "error",
      });
    }
  }, [show, showLoading, hideLoading, updateActiveOrderDetails]);
  
  // DEFERRED RENDERING: Progressive staged rendering via double-rAF
  // Stage 0: Skeleton placeholders (instant first paint)
  // Stage 1: BillSection (lighter — user sees their order first)
  // Stage 2: MenuSection + MoreOptionsBottomSheet + FlatList data (heavier)
  const [renderStage, setRenderStage] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRenderStage(1);
        requestAnimationFrame(() => {
          setRenderStage(2);
        });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const displayOrders = renderStage >= 2 ? reversedFilteredOrders : EMPTY_ORDERS;

  const renderOrderBadge = useCallback(
    ({ item }: { item: OrderProfile }) => (
      <OrderBadge
        order={item}
        onMarkReady={() => handleMarkReady(item)}
        onMarkDone={() => handleMarkDone(item.id)}
        onViewItems={() => handleViewItems(item.id)}
        onRetrieve={() => handleRetrieve(item.id)}
        onReopenCheck={() => handleReopenCheck(item.id)}
        onPrintReceipt={() => handlePrintReceipt(item)}
      />
    ),
    [handleMarkReady, handleMarkDone, handleViewItems, handleRetrieve, handleReopenCheck, handlePrintReceipt],
  );

  const badgeKeyExtractor = useCallback((item: OrderProfile) => item.id, []);

  const handleAccordionChange = useCallback(
    (value: string | undefined) => setIsAccordionOpen(!!value),
    [],
  );

  const handleCloseItemsModal = useCallback(() => setItemsModalOpen(false), []);

  return (
    <View className="flex-1 flex-col bg-screen px-2 py-1">
      <View className="flex-1 flex-row bg-screen rounded-lg border border-border">
        {/* Stage 1: BillSection (lighter — user sees their order first) */}
        {renderStage >= 1 ? (
          <BillSection
            moreOptionsSheetRef={
              moreOptionsSheetRef as React.RefObject<BottomSheetMethods>
            }
            discountSheetRef={
              discountSheetRef as React.RefObject<BottomSheetMethods>
            }
          />
        ) : (
          // BillSection skeleton: matches the 380px sidebar layout
          <View className="w-[380px] bg-screen p-4">
            <View className="h-10 w-48 bg-panel rounded-lg mb-4" />
            <View className="h-6 w-32 bg-panel rounded-md mb-3" />
            <View className="h-6 w-64 bg-panel rounded-md mb-3" />
            <View className="h-6 w-52 bg-panel rounded-md mb-3" />
            <View className="flex-1" />
            <View className="h-14 bg-panel rounded-xl" />
          </View>
        )}

        <View className="flex-1 bg-screen ml-4">
          {/* Stage 2: MenuSection (heavier — fills in after BillSection) */}
          {renderStage >= 2 ? (
            <MenuSection
              headerLeft={
                <View className="flex-row items-center gap-x-2">
                  <Text className="text-lg font-semibold text-white">
                    Order Line
                  </Text>
                  {displayOrders?.length > 0 && (
                    <View className="ml-1 bg-panel border border-border rounded-full px-2.5 py-0.5 items-center justify-center">
                      <Text className="text-xs font-bold text-label">
                        {displayOrders.length}
                      </Text>
                    </View>
                  )}
                </View>
              }
              headerBelow={
                !isAccordionOpen && displayOrders.length > 0 ? (
                  <View className="px-3 py-1.5">
                    <FlatList
                      horizontal
                      data={displayOrders}
                      keyExtractor={badgeKeyExtractor}
                      className="mt-1 max-h-12"
                      contentContainerStyle={badgeContentStyle}
                      showsHorizontalScrollIndicator={false}
                      initialNumToRender={10}
                      maxToRenderPerBatch={10}
                      windowSize={3}
                      removeClippedSubviews={true}
                      renderItem={renderOrderBadge}
                    />
                  </View>
                ) : null
              }
            />
          ) : (
            // MenuSection skeleton: matches the grid layout
            <View className="flex-1 p-4">
              <View className="flex-row gap-x-2 mb-3">
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} className="h-10 w-20 bg-panel rounded-lg" />
                ))}
              </View>
              <View className="flex-row flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <View key={i} className="h-24 w-28 bg-panel rounded-xl" />
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Stage 2: Defer MoreOptionsBottomSheet — starts closed (index={-1}), safe to delay */}
      {renderStage >= 2 && (
        <MoreOptionsBottomSheet
          ref={moreOptionsSheetRef as React.RefObject<BottomSheetMethods>}
          discountSheetRef={
            discountSheetRef as React.RefObject<BottomSheetMethods>
          }
          onCloseCheck={handleCloseCheck}
        />
      )}

      {isItemsModalOpen && (
        <OrderLineItemsModal
          isOpen={isItemsModalOpen}
          onClose={handleCloseItemsModal}
          orderId={selectedOrderId}
        />
      )}
    </View>
  );
};

export default OrderProcessing;
