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
import { useToast } from "@/contexts/ToastContext"; // New Import
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";

const OrderProcessing = () => {
  const {
    activeOrderId,
    orders,
    setActiveOrder,
    startNewOrder,
    updateOrderStatus,
    markAllItemsAsReady,
    archiveOrder,
  } = useOrderStore();

  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);
  const discountSheetRef = useRef<BottomSheetMethods>(null);

  useEffect(() => {
    // Find an existing empty draft order (not assigned to table, no items)
    const emptyDraft = orders.find(
      (o) =>
        o.service_location_id === null &&
        o.order_status === "draft" &&
        o.items.length === 0
    );

    // Find any global draft order (not assigned to table)
    const globalDraft = orders.find(
      (o) => o.service_location_id === null && o.order_status === "draft"
    );

    if (!activeOrderId) {
      if (emptyDraft) {
        // Reuse existing empty draft
        setActiveOrder(emptyDraft.id);
      } else if (globalDraft) {
        // Use global draft with items
        setActiveOrder(globalDraft.id);
      } else {
        // Create new draft only if none exist
        const newOrder = startNewOrder();
        setActiveOrder(newOrder.id);
      }
      return;
    }

    // If activeOrderId exists, do not override it here. This allows "Retrieve to Pay"
    // to set a non-global order as active without being reset by this effect.
    const currentActive = orders.find((o) => o.id === activeOrderId);
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
  }, [orders, activeOrderId, setActiveOrder, startNewOrder]);

  // State to hold the orders that are actually displayed
  const filteredOrders = useMemo(() => {
    // Show orders that are in a "kitchen" state (preparing) or unpaid
    const kitchenOrders = orders.filter(
      (o) =>
        // Condition 1: Any "preparing" order with items (includes Dine In, Takeaway, Delivery)
        (o.order_status === "preparing" && o.items.length > 0) ||
        // Condition 2: Unpaid orders that need payment
        (o.paid_status === "Unpaid" &&
          o.order_status !== "completed" &&
          o.order_status !== "draft" &&
          o.order_status !== "void")
    );

    return kitchenOrders;
  }, [orders]);

  const reversedFilteredOrders = useMemo(() => {
    return filteredOrders.slice().reverse();
  }, [filteredOrders]);

  const handleViewItems = (orderId: string) => {
    setSelectedOrderId(orderId);
    setItemsModalOpen(true);
  };

  const handleMarkReady = (order: OrderProfile) => {
    // First, mark the order as ready
    markAllItemsAsReady(order.id);

    // Then, check if it's a Takeaway order and archive it
    if (order.order_type === "takeout" && order.paid_status === "Paid") {
      // A small delay can improve UX, ensuring the user sees the status change before it disappears.
      setTimeout(() => {
        archiveOrder(order.id);
      }, 500); // 0.5 second delay
    }
  };

  const handleRetrieve = (orderId: string) => {
    setActiveOrder(orderId);
  };

  // Placeholder functions for MoreOptionsBottomSheet
  const { show } = useToast();

  const handleCloseCheck = () => {
    show({
      title: "Close Check",
      message:
        "Close Check functionality for Order Processing not yet implemented.",
      type: "success",
    });
  };

  const handleApplyDiscount = () => {
    show({
      title: "Apply Discount",
      message:
        "Apply Discount functionality for Order Processing not yet implemented.",
      type: "success",
    });
  };

  const handleApplyVoucher = () => {
    show({
      title: "Apply Voucher",
      message:
        "Apply Voucher functionality for Order Processing not yet implemented.",
      type: "success",
    });
  };

  return (
    <View className="flex-1 flex-col bg-[#212121]">
      <View className="flex-1 flex-row">
        <BillSection
          moreOptionsSheetRef={
            moreOptionsSheetRef as React.RefObject<BottomSheetMethods>
          }
          discountSheetRef={
            discountSheetRef as React.RefObject<BottomSheetMethods>
          }
        />

        <View className="flex-1 py-4 px-2 pt-0 bg-[#212121]">
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
                  {filteredOrders?.length > 0 && (
                    <Badge className="ml-2 bg-blue-600 rounded-md justify-center items-center p-1 h-8 w-8">
                      <Text className="text-base font-bold text-white">
                        {filteredOrders.length}
                      </Text>
                    </Badge>
                  )}
                </View>
              </AccordionTrigger>
              <AccordionContent>
                <OrderLineSection />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Always render the OrderBadge container but control visibility */}
          <View
            className={
              !isAccordionOpen && filteredOrders.length > 0
                ? "opacity-100"
                : "opacity-0"
            }
            style={
              !isAccordionOpen && filteredOrders.length > 0
                ? { height: "auto" }
                : { height: 0 }
            }
          >
            <FlatList
              horizontal
              data={reversedFilteredOrders}
              keyExtractor={(item) => item.id}
              className="mt-2 max-h-16" // Adjusted height
              contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <OrderBadge
                  order={item}
                  onMarkReady={() => handleMarkReady(item)}
                  onViewItems={() => handleViewItems(item.id)}
                  onRetrieve={() => handleRetrieve(item.id)}
                />
              )}
            />
          </View>

          <MenuSection />
        </View>
      </View>
      <MoreOptionsBottomSheet
        ref={moreOptionsSheetRef as React.RefObject<BottomSheetMethods>}
        discountSheetRef={
          discountSheetRef as React.RefObject<BottomSheetMethods>
        }
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
