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
import { ScrollView, Text, View } from "react-native";

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

  useEffect(() => {
    // Ensure there is at least one active order. If none, create/select a global Building order.
    const globalBuilding = orders.find(
      (o) => o.service_location_id === null && o.order_status === "Building"
    );

    if (!activeOrderId) {
      if (globalBuilding) {
        setActiveOrder(globalBuilding.id);
      } else {
        const newOrder = startNewOrder();
        setActiveOrder(newOrder.id);
      }
      return;
    }

    // If activeOrderId exists, do not override it here. This allows "Retrieve to Pay"
    // to set a non-global order as active without being reset by this effect.
    const currentActive = orders.find((o) => o.id === activeOrderId);
    if (!currentActive) {
      if (globalBuilding) {
        setActiveOrder(globalBuilding.id);
      } else {
        const newOrder = startNewOrder();
        setActiveOrder(newOrder.id);
      }
    }
  }, [orders, activeOrderId, setActiveOrder, startNewOrder]);

  // State to hold the orders that are actually displayed
  const filteredOrders = useMemo(() => {
    // Show only orders that are in a "kitchen" state
    const kitchenOrders = orders.filter(
      (o) =>
        (o.order_type !== "Dine In" &&
          // Condition 1: Must be in Preparing state
          o.order_status === "Preparing" &&
          // Condition 2: Must have one or more items
          o.items.length > 0) ||
        (o.paid_status === "Unpaid" &&
          o.order_status !== "Closed" &&
          o.order_status !== "Building")
    );

    return kitchenOrders;
  }, [orders]);

  const handleViewItems = (orderId: string) => {
    setSelectedOrderId(orderId);
    setItemsModalOpen(true);
  };

  const handleMarkReady = (order: OrderProfile) => {
    // First, mark the order as ready
    markAllItemsAsReady(order.id);

    // Then, check if it's a Takeaway order and archive it
    if (order.order_type === "Takeaway" && order.paid_status === "Paid") {
      // A small delay can improve UX, ensuring the user sees the status change before it disappears.
      setTimeout(() => {
        archiveOrder(order.id);
      }, 500); // 0.5 second delay
    }
  };

  const handleRetrieve = (orderId: string) => {
    setActiveOrder(orderId);
  };

  return (
    <View className="flex-1 flex-col bg-[#212121]">
      <View className="flex-1 flex-row">
        <BillSection />

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

          {!isAccordionOpen && filteredOrders.length > 0 && (
            <ScrollView
              horizontal
              className="mt-2 max-h-14"
              contentContainerClassName="flex-row gap-x-2"
              showsHorizontalScrollIndicator={false}
            >

              {filteredOrders.map((order) => (
                <OrderBadge
                  key={order.id}
                  order={order}
                  onMarkReady={() => handleMarkReady(order)}
                  onViewItems={() => handleViewItems(order.id)}
                  onRetrieve={() => handleRetrieve(order.id)}
                />
              ))}
            </ScrollView>
          )}

          <MenuSection />
        </View>
      </View>

      <OrderLineItemsModal
        isOpen={isItemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        orderId={selectedOrderId}
      />
    </View>
  );
};

export default OrderProcessing;
