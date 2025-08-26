import BillSection from "@/components/bill/BillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderLineSection from "@/components/order/OrderLineSection";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect, useMemo } from "react";
import { Text, View } from "react-native";

const index = () => {
  const { orders, setActiveOrder, startNewOrder } = useOrderStore();

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

    // This part of the logic remains the same

    return kitchenOrders;

  }, [orders]);

  return (
    <View className="flex-1 flex-col">
      {/* Content Section (Below Header) */}
      <View className="flex-1 flex-row">
        <View className="flex-1 p-6 px-4 pt-0">
          <Accordion type="single" collapsible defaultValue="orders">
            <AccordionItem value="orders">
              <AccordionTrigger>
                <View className="flex-row items-center gap-x-2">
                  <Text className="text-2xl font-bold text-gray-800">Order Line</Text>
                  {
                    filteredOrders?.length > 0 && (
                      <Badge className="ml-2 bg-primary-400 rounded-full justify-center items-center">
                        <Text className="text-xs font-bold text-white">
                          {filteredOrders.length}
                        </Text>
                      </Badge>
                    )
                  }
                </View>
              </AccordionTrigger>
              <AccordionContent>
                <OrderLineSection />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* --- Menu Section --- */}
          <MenuSection />
        </View>

        {/* Bill Section (White Area) */}
        <BillSection />
      </View>
    </View>
  );
};

export default index;
