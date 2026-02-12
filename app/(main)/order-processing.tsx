import BillSection from "@/components/bill/BillSection";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import MenuSection from "@/components/menu/MenuSection";
import OrderBadge from "@/components/order/OrderBadge";
import OrderLineItemsModal from "@/components/order/OrderLineItemsModal";
import OrderLineSection from "@/components/order/OrderLineSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { OrderProfile } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { getOrderStoreSupabaseClient, useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, InteractionManager, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";

const OrderProcessing = () => {
  // FIXED: Use individual selectors to prevent subscribing to entire ordersById
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const startNewOrder = useOrderStore((s) => s.startNewOrder);
  const markAllItemsAsReady = useOrderStore((s) => s.markAllItemsAsReady);
  const archiveOrder = useOrderStore((s) => s.archiveOrder);
  const updateOrderCheckStatus = useOrderStore((s) => s.updateOrderCheckStatus);
  const activeOrder = useOrderStore((s) => s.activeOrderId ? s.ordersById[s.activeOrderId] : null);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const daysToShow = useSettingsStore((s) => s.orderLineSettings.daysToShow);

  // OPTIMIZED: Use shallow selector to filter orders inside the store selector.
  // This prevents the component from re-rendering unless the resulting list of filtered orders changes.
  // We compute both the filtered list and its reverse here to avoid extra memos.
  const reversedFilteredOrders = useOrderStore(
    useShallow((state) => {
      // Date cutoff based on orderLineSettings.daysToShow
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToShow);
      cutoffDate.setHours(0, 0, 0, 0);
      const cutoffTime = cutoffDate.getTime();

      // PERF: Iterate orderIds in reverse directly, avoiding intermediate array + .reverse()
      const result: typeof state.ordersById[string][] = [];
      for (let i = state.orderIds.length - 1; i >= 0; i--) {
        const o = state.ordersById[state.orderIds[i]];
        if (!o) continue;
        if (
          new Date(o.opened_at || 0).getTime() >= cutoffTime &&
          o.order_type !== "Dine In" &&
          o.order_type !== "dine_in" &&
          ((o.order_status === "preparing" && o.items.length > 0) ||
            ((o.paid_status === "Unpaid" ||
              o.paid_status === "Pending" ||
              o.paid_status === "Partial") &&
              o.order_status !== "completed" &&
              o.order_status !== "draft" &&
              o.order_status !== "void" &&
              o.check_status !== "Closed"))
        ) {
          result.push(o);
        }
      }
      return result;
    }),
  );

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

  const handleViewItems = (orderId: string) => {
    setSelectedOrderId(orderId);
    setItemsModalOpen(true);
  };

  const handleMarkReady = (order: OrderProfile) => {
    markAllItemsAsReady(order.id);
    console.log("we are readying", order.order_type, order.paid_status);

    // Then, check if it's a Takeaway order and archive it
    // Note: archiveOrder now handles inventory deduction automatically
    if (order.order_type === "Takeaway" && order.paid_status === "Paid" ||  order.check_status !== "Closed") {
      // A small delay can improve UX, ensuring the user sees the status change before it disappears.
      setTimeout(() => {
        archiveOrder(order.id);
      }, 500);
    }
  };

  const handleRetrieve = (orderId: string) => {
    setActiveOrder(orderId);
  };

  const handleReopenCheck = (orderId: string) => {
    updateOrderCheckStatus(orderId, "Opened");
    setActiveOrder(orderId);
  };

  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();

  const handleCloseCheck = async () => {
    if (!activeOrderId || !activeOrder) return;

    // Validate order has backend ID
    if (!activeOrder.db_order_id) {
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
        activeOrder.db_order_id,
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
  };
  
  // DEFERRED RENDERING: Wait for navigation transition to complete before rendering heavy components
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => handle.cancel();
  }, []);

  return (
    <View className="flex-1 flex-col bg-[#212121]">
      <View className="flex-1 flex-row">
        {isReady ? (
          <BillSection
            moreOptionsSheetRef={
              moreOptionsSheetRef as React.RefObject<BottomSheetMethods>
            }
            discountSheetRef={
              discountSheetRef as React.RefObject<BottomSheetMethods>
            }
          />
        ) : (
          <View className="w-[380px] bg-[#212121]" />
        )}

        <View className="flex-1 py-4 px-2 pt-0 bg-[#323232] rounded-tl-3xl ">
          <Accordion
            type="single"
            collapsible
            onValueChange={(value: string | undefined) =>
              setIsAccordionOpen(!!value)
            }
          >
            <AccordionItem value="orders">
              <AccordionTrigger className="py-3">
                <View className="flex-row items-center gap-x-2">
                  <Text className="text-2xl font-bold text-white">
                    Order Line
                  </Text>
                  {reversedFilteredOrders?.length > 0 && (
                    <Badge className="ml-2 bg-blue-600 rounded-md justify-center items-center p-1 h-8 w-8">
                      <Text className="text-base font-bold text-white">
                        {reversedFilteredOrders.length}
                      </Text>
                    </Badge>
                  )}
                </View>
              </AccordionTrigger>
              <AccordionContent>
                {/* Defer rendering of heavy list */}
                {isReady ? (
                  <OrderLineSection />
                ) : (
                  <View className="h-64 items-center justify-center">
                    <Text className="text-gray-500">Loading orders...</Text>
                  </View>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <View
            className={
              !isAccordionOpen && reversedFilteredOrders.length > 0
                ? "opacity-100"
                : "opacity-0"
            }
            style={
              !isAccordionOpen && reversedFilteredOrders.length > 0
                ? { height: "auto" }
                : { height: 0 }
            }
          >
            <FlatList
              horizontal
              data={reversedFilteredOrders}
              keyExtractor={(item) => item.id}
              className="mt-2 max-h-16"
              contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
              showsHorizontalScrollIndicator={false}
              // OPTIMIZED: Performance props for badge list
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={3}
              removeClippedSubviews={true}
              renderItem={({ item }) => (
                <OrderBadge
                  order={item}
                  onMarkReady={() => handleMarkReady(item)}
                  onViewItems={() => handleViewItems(item.id)}
                  onRetrieve={() => handleRetrieve(item.id)}
                  onReopenCheck={() => handleReopenCheck(item.id)}
                />
              )}
            />
          </View>

          {/* Defer MenuSection as well - it's very heavy */}
          {isReady ? <MenuSection /> : <View className="flex-1" />}
        </View>
      </View>
      <MoreOptionsBottomSheet
        ref={moreOptionsSheetRef as React.RefObject<BottomSheetMethods>}
        discountSheetRef={
          discountSheetRef as React.RefObject<BottomSheetMethods>
        }
        onCloseCheck={() => handleCloseCheck()}
      />

      <OrderLineItemsModal
        isOpen={isItemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        orderId={selectedOrderId}
      />
    </View>
  );
};

export default OrderProcessing;
