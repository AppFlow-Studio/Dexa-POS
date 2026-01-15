import { OrderProfile } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { DollarSign, FileText, Grid3x3, Printer, Receipt, X } from "lucide-react-native";
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import BillItemsSection from "./BillItemsSection";
import PaymentCoverageSection from "./PaymentCoverageSection";
import PaymentTimelineSection from "./PaymentTimelineSection";
import { useOrderStore } from "@/stores/useOrderStore";

interface OrderDetailsBottomSheetProps {
  order: OrderProfile | null;
  onClose: () => void;
  onPrint?: (order: OrderProfile) => void;
  onRefund?: (order: OrderProfile) => void;
}

type TabType = "bill" | "payments" | "coverage";

const OrderDetailsBottomSheet = forwardRef<BottomSheetMethods, OrderDetailsBottomSheetProps>(
  ({ order, onClose, onPrint, onRefund }, ref) => {
    const bottomSheetRef = useRef<BottomSheetMethods>(null);
    const snapPoints = useMemo(() => ["95%"], []);
    const [selectedTab, setSelectedTab] = useState<TabType>("bill");
    const { ordersByDbId } = useOrderStore();
    const DetailsOrder = ordersByDbId[order?.db_order_id || ""];
    useImperativeHandle(ref, () => ({
      snapToIndex: (index: number) => bottomSheetRef.current?.snapToIndex(index),
      snapToPosition: (position: string | number) =>
        bottomSheetRef.current?.snapToPosition(position),
      expand: () => bottomSheetRef.current?.expand(),
      collapse: () => bottomSheetRef.current?.collapse(),
      close: () => bottomSheetRef.current?.close(),
      forceClose: () => bottomSheetRef.current?.forceClose(),
    }));

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    );

    const handleClose = () => {
      bottomSheetRef.current?.close();
      onClose();
    };

    if (!order) return null;

    console.log("DetailsOrder", DetailsOrder);
    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#4B5563" }}
        onClose={onClose}
      >
        <BottomSheetScrollView className="flex-1 bg-[#212121]">
          {/* Header */}
          <View className="px-4 py-3 border-b border-gray-700">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-2xl font-bold text-white">
                Order Details
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                className="p-2 rounded-full bg-gray-700"
              >
                <X color="#9CA3AF" size={24} />
              </TouchableOpacity>
            </View>

            {/* Order Summary */}
            <View className="flex-row items-center gap-3 mt-2">
              <View className="bg-blue-900/30 border border-blue-500 px-3 py-1 rounded-lg">
                <Text className="text-blue-400 font-bold">{order.display_number || order.order_number || order.id}</Text>
              </View>
              <Text className="text-gray-400">
                {order.opened_at
                  ? new Date(order.opened_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "-"}
                {" at "}
                {order.opened_at
                  ? new Date(order.opened_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-"}
              </Text>
            </View>
            <View className="flex-row items-center gap-3 mt-2">
              <Text className="text-white font-semibold">{order.customer_name || "Walk-In"}</Text>
              <View className="bg-green-900/30 border border-green-500 px-2 py-1 rounded">
                <Text className="text-green-400 font-bold text-sm">{order.paid_status || "Unpaid"}</Text>
              </View>
              <Text className="text-white font-bold ml-auto">${order.total_amount?.toFixed(2) || "0.00"}</Text>
            </View>
          </View>

          {/* Tab Selector */}
          <View className="flex-row border-b border-gray-700 px-4">
            <Pressable
              onPress={() => setSelectedTab("bill")}
              className={`flex-row items-center gap-2 py-3 px-4 border-b-2 ${
                selectedTab === "bill" ? "border-blue-500" : "border-transparent"
              }`}
            >
              <Receipt
                color={selectedTab === "bill" ? "#3B82F6" : "#9CA3AF"}
                size={20}
              />
              <Text
                className={`font-semibold ${
                  selectedTab === "bill" ? "text-blue-500" : "text-gray-400"
                }`}
              >
                Bill
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedTab("payments")}
              className={`flex-row items-center gap-2 py-3 px-4 border-b-2 ${
                selectedTab === "payments" ? "border-blue-500" : "border-transparent"
              }`}
            >
              <DollarSign
                color={selectedTab === "payments" ? "#3B82F6" : "#9CA3AF"}
                size={20}
              />
              <Text
                className={`font-semibold ${
                  selectedTab === "payments" ? "text-blue-500" : "text-gray-400"
                }`}
              >
                Payments
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedTab("coverage")}
              className={`flex-row items-center gap-2 py-3 px-4 border-b-2 ${
                selectedTab === "coverage" ? "border-blue-500" : "border-transparent"
              }`}
            >
              <Grid3x3
                color={selectedTab === "coverage" ? "#3B82F6" : "#9CA3AF"}
                size={20}
              />
              <Text
                className={`font-semibold ${
                  selectedTab === "coverage" ? "text-blue-500" : "text-gray-400"
                }`}
              >
                Coverage
              </Text>
            </Pressable>
          </View>

          {/* Scrollable Content */}
          <BottomSheetScrollView className="flex-1 px-4">
            {selectedTab === "bill" && <BillItemsSection order={order} />}
            {selectedTab === "payments" && <PaymentTimelineSection order={order} />}
            {selectedTab === "coverage" && <PaymentCoverageSection order={order} />}
          </BottomSheetScrollView>

          {/* Fixed Footer with Quick Actions */}
          <View className="px-4 py-3 border-t border-gray-700 bg-[#212121]">
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => onPrint?.(order)}
                className="flex-1 flex-row items-center justify-center gap-2 py-3 bg-blue-600 rounded-lg"
              >
                <Printer color="#FFFFFF" size={20} />
                <Text className="text-white font-semibold">Print Receipt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onRefund?.(order)}
                className="flex-1 flex-row items-center justify-center gap-2 py-3 bg-orange-600 rounded-lg"
              >
                <DollarSign color="#FFFFFF" size={20} />
                <Text className="text-white font-semibold">Refund</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleClose}
                className="flex-1 flex-row items-center justify-center gap-2 py-3 bg-gray-600 rounded-lg"
              >
                <FileText color="#FFFFFF" size={20} />
                <Text className="text-white font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

OrderDetailsBottomSheet.displayName = "OrderDetailsBottomSheet";

export default OrderDetailsBottomSheet;
