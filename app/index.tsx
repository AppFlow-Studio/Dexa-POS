import BillSummary from "@/components/bill/BillSummary";
import DiscountSection from "@/components/bill/DiscountSection";
import OrderDetails from "@/components/bill/OrderDetails";
import PaymentActions from "@/components/bill/PaymentActions";
import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Totals from "@/components/bill/Totals";
import Header from "@/components/Header";
import OrderCard from "@/components/order/OrderCard";
import OrderTabs from "@/components/order/OrderTabs";
import Sidebar from "@/components/Sidebar";
import { Order } from "@/lib/types";
import BottomSheet from "@gorhom/bottom-sheet";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useRef } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

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
    <View className="w-96 bg-white p-6 border-l border-gray-200">
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
    <View className="flex-1 flex-row bg-white">
      {/* Column 1: Sidebar */}
      <Sidebar />

      {/* Column 2: Main Content Area (takes up remaining space) */}
      <View className="flex-1 p-6 bg-gray-50">
        <Header />

        {/* --- Order Line Section --- */}
        <View className="mt-6">
          <View className="flex-row justify-between items-center">
            <Text className="text-2xl font-bold text-gray-800">Order Line</Text>
            <View className="flex-row items-center space-x-2">
              <TouchableOpacity className="p-2 bg-white border border-gray-200 rounded-full">
                <ChevronLeft color="#374151" size={20} />
              </TouchableOpacity>
              <TouchableOpacity className="p-2 bg-blue-500 rounded-full">
                <ChevronRight color="#FFFFFF" size={20} />
              </TouchableOpacity>
            </View>
          </View>
          <OrderTabs onTabChange={handleTabChange} />
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

        {/* --- Menu Section (Placeholder) --- */}
        {/* TODO: You can now build out the menu components here */}
        <View className="mt-6 flex-1">
          <Text className="text-2xl font-bold text-gray-800">Menu</Text>
          {/* Add MenuTabs, MenuCategories, SearchBar, and a ScrollView for MenuItems here */}
          <View className="flex-1 bg-gray-100 mt-4 rounded-xl items-center justify-center">
            <Text className="text-gray-400">Menu Grid Goes Here</Text>
          </View>
        </View>
      </View>

      {/* Column 3: Bill Section */}
      <BillSection onPlaceOrder={handlePlaceOrder} />

      <PaymentBottomSheet
        ref={bottomSheetRef}
        onClose={handleCloseBottomSheet}
      />
    </View>
  );
};

export default index;
