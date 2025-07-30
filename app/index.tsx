import BillSummary from "@/components/bill/BillSummary";
import DiscountSection from "@/components/bill/DiscountSection";
import OrderDetails from "@/components/bill/OrderDetails";
import PaymentActions from "@/components/bill/PaymentActions";
import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Totals from "@/components/bill/Totals";
import Header from "@/components/Header";
import MenuSection from "@/components/menu/MenuSection";
import SearchBottomSheet from "@/components/menu/SearchBottomSheet";
import OrderLineSection from "@/components/order/OrderLineSection";
import Sidebar from "@/components/Sidebar";
import BottomSheet from "@gorhom/bottom-sheet";
import React, { useRef } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BillSection = ({ onPlaceOrder }: { onPlaceOrder: () => void }) => {
  return (
    <View className="w-96 bg-white p-6 border-gray-200">
      <OrderDetails />
      <BillSummary />
      <Totals />
      <DiscountSection />
      <PaymentActions onPlaceOrder={onPlaceOrder} />
    </View>
  );
};

const index = () => {
  const bottomSheetRef = useRef<BottomSheet>(null);

  const handlePlaceOrder = () => {
    bottomSheetRef.current?.snapToIndex(0); // The 'expand' method opens it to the first snap point
  };

  const handleCloseBottomSheet = () => {
    bottomSheetRef.current?.close();
  };

  return (
    <SafeAreaView className="flex-1 bg-background-100">
      <View className="flex-1 flex-row">
        {/* Column 1: Sidebar */}
        <Sidebar />

        {/* This new View wraps everything to the right of the sidebar */}
        <View className="flex-1 flex-col">
          {/* Header Section: Spans the full width of this column */}
          <View className="px-6 pb-4 border-gray-200">
            <Header />
          </View>

          {/* Content Section (Below Header) */}
          <View className="flex-1 flex-row">
            <View className="flex-1 p-6 pt-0">
              <OrderLineSection />

              {/* --- Menu Section --- */}
              <MenuSection />
            </View>

            {/* Bill Section (White Area) */}
            <BillSection onPlaceOrder={handlePlaceOrder} />
          </View>
        </View>
      </View>

      {/* Bottom Sheet remains at the root to overlay everything */}
      <PaymentBottomSheet
        ref={bottomSheetRef}
        onClose={handleCloseBottomSheet}
      />
      <SearchBottomSheet />
    </SafeAreaView>
  );
};

export default index;
