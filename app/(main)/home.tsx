import BillSection from "@/components/bill/BillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderLineSection from "@/components/order/OrderLineSection";
import React from "react";
import { View } from "react-native";

const index = () => {
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
