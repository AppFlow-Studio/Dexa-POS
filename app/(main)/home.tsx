import BillSection from "@/components/bill/BillSection";
import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Header from "@/components/Header";
import MenuSection from "@/components/menu/MenuSection";
import SearchBottomSheet from "@/components/menu/SearchBottomSheet";
import OrderLineSection from "@/components/order/OrderLineSection";
import BottomSheet from "@gorhom/bottom-sheet";
import React, { useRef } from "react";
import { View } from "react-native";

const index = () => {
  const bottomSheetRef = useRef<BottomSheet>(null);

  const handlePlaceOrder = () => {
    bottomSheetRef.current?.snapToIndex(0); // The 'expand' method opens it to the first snap point
  };

  const handleCloseBottomSheet = () => {
    bottomSheetRef.current?.close();
  };

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
        <BillSection onPlaceOrder={handlePlaceOrder} />
      </View>
      {/* Bottom Sheet remains at the root to overlay everything */}
      <PaymentBottomSheet
        ref={bottomSheetRef}
        onClose={handleCloseBottomSheet}
      />
      <SearchBottomSheet />
    </View>
  );
};

export default index;
