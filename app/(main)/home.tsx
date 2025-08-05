import BillSection from "@/components/bill/BillSection";
import Header from "@/components/Header";
import MenuSection from "@/components/menu/MenuSection";
import OrderLineSection from "@/components/order/OrderLineSection";
import React from "react";
import { View } from "react-native";

const index = () => {
  return (
    <View className="flex-1 flex-col">
      {/* Header Section: Spans the full width of this column */}
      <View className="px-6 pb-4 border-gray-200">
        <Header />
      </View>

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
