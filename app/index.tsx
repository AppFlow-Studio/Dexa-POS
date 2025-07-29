import BillSummary from "@/components/bill/BillSummary";
import DiscountSection from "@/components/bill/DiscountSection";
import OrderDetails from "@/components/bill/OrderDetails";
import PaymentActions from "@/components/bill/PaymentActions";
import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Totals from "@/components/bill/Totals";
import Header from "@/components/Header";
import MenuSection from "@/components/menu/MenuSection";
import OrderCard from "@/components/order/OrderCard";
import OrderTabs from "@/components/order/OrderTabs";
import Sidebar from "@/components/Sidebar";
import { Order } from "@/lib/types";
import BottomSheet from "@gorhom/bottom-sheet";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useRef } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const orders: Order[] = [
  {
    id: "45654",
    customerName: "Jake Carter",
    status: "Ready",
    type: "Dine In",
    table: 2,
    time: "2 Minutes ago",
  },
  {
    id: "45675",
    customerName: "Emma Brooks",
    status: "Preparing",
    type: "Dine In",
    table: 2,
    time: "2 Minutes ago",
  },
  {
    id: "45629",
    customerName: "Mason Reed",
    status: "Ready",
    type: "Dine In",
    table: 2,
    time: "2 Minutes ago",
  },
];

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

  const handleTabChange = (tabName: string) => {
    console.log("Selected Tab:", tabName);
    //TODO: Add filtering logic here
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
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
              <View>
                <View className="flex-row justify-between items-center">
                  <OrderTabs onTabChange={handleTabChange} />
                  <View className="flex-row items-center gap-2 space-x-2">
                    <TouchableOpacity className="p-2 bg-white border border-gray-200 rounded-full">
                      <ChevronLeft color="#374151" size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity className="p-2 bg-primary-400 rounded-full">
                      <ChevronRight color="#FFFFFF" size={20} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-4"
                >
                  {orders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </ScrollView>
              </View>

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
    </SafeAreaView>
  );
};

export default index;
