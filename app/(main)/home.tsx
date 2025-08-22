import BillSection from "@/components/bill/BillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderLineSection from "@/components/order/OrderLineSection";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect } from "react";
import { View } from "react-native";

const index = () => {
  const { orders, setActiveOrder, startNewOrder } = useOrderStore();

  useEffect(() => {
    let activeOrder = orders.find(
      (o) => o.service_location_id === null && o.order_status === "Preparing"
    );
    if (!activeOrder) {
      activeOrder = startNewOrder(); // No tableId, creates a global order
    }
    setActiveOrder(activeOrder.id);

    // Cleanup on unmount
    return () => setActiveOrder(null);
  }, [orders, setActiveOrder, startNewOrder]);

  return (
    <View className="flex-1 flex-col">
      {/* Content Section (Below Header) */}
      <View className="flex-1 flex-row">
        <View className="flex-1 p-6 px-4 pt-0">
          <OrderLineSection />

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
