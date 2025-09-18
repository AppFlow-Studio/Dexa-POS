import BillSection from "@/components/bill/BillSection";
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
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

const OrderProcessing = () => {
  const {
    orders,
    setActiveOrder,
    startNewOrder,
    updateOrderStatus,
    archiveOrder,
  } = useOrderStore();

  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const { activeOrderId } = useOrderStore.getState();

    // Check if there's already an active order that's a global building order
    let activeOrder = orders.find(
      (o) => o.service_location_id === null && o.order_status === "Building"
    );

    // If no active order exists or the current active order is not a global building order
    if (!activeOrder || (activeOrderId && activeOrder.id !== activeOrderId)) {
      activeOrder = startNewOrder(); // No tableId, creates a global order
    }

    setActiveOrder(activeOrder.id);

    // Cleanup on unmount
    return () => setActiveOrder(null);
  }, [orders, setActiveOrder, startNewOrder]);

  // State to hold the orders that are actually displayed
  const filteredOrders = useMemo(() => {
    // Show only orders that are in a "kitchen" state
    const kitchenOrders = orders.filter(
      (o) =>
        // Condition 1: Must be in Preparing state
        o.order_status === "Preparing" &&
        // Condition 2: Must have one or more items
        o.items.length > 0
    );

    return kitchenOrders;
  }, [orders]);

  const handleViewItems = (orderId: string) => {
    setSelectedOrderId(orderId);
    setItemsModalOpen(true);
  };

  const handleMarkReady = (order: OrderProfile) => {
    // First, mark the order as ready
    updateOrderStatus(order.id, "Ready");

    // Then, check if it's a Take Away order and archive it
    if (order.order_type === "Take Away") {
      // A small delay can improve UX, ensuring the user sees the status change before it disappears.
      setTimeout(() => {
        archiveOrder(order.id);
      }, 500); // 0.5 second delay
    }
  };

  return (
    <View className="flex-1 flex-col bg-[#212121]">
      {/* Content Section (Below Header) */}
      <View className="flex-1 flex-row">
        {/* Bill Section (White Area) */}
        <BillSection />

        <View className="flex-1 p-6 px-4 pt-0 bg-[#212121]">
          <Accordion
            type="single"
            collapsible
            onValueChange={(value: string | undefined) =>
              setIsAccordionOpen(!!value)
            }
          >
            <AccordionItem value="orders">
              <AccordionTrigger>
                <View className="flex-row items-center gap-x-2">
                  <Text className="text-3xl font-bold text-white">
                    Order Line
                  </Text>
                  {filteredOrders?.length > 0 && (
                    <Badge className="ml-2 bg-blue-600 rounded-md justify-center items-center p-2 h-10 w-10">
                      <Text className="text-xl font-bold text-white">
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

          {/* Show order badges when accordion is closed */}
          {!isAccordionOpen && filteredOrders.length > 0 && (
            <View className="mt-4 flex-row flex-wrap gap-3">
              {filteredOrders.map((order) => (
                <OrderBadge
                  key={order.id}
                  order={order}
                  onMarkReady={() => handleMarkReady(order)}
                  onViewItems={() => handleViewItems(order.id)}
                />
              ))}
            </View>
          )}

          {/* --- Menu Section --- */}
          <MenuSection />
        </View>
      </View>

      {/* Order Items Modal */}
      <OrderLineItemsModal
        isOpen={isItemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        orderId={selectedOrderId}
      />
    </View>
  );
};

export default OrderProcessing;
