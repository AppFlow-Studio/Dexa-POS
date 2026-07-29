import { OrderProfile } from "@/lib/types";
import { useOrderDetails } from "@/hooks/orders/useOrderDetails";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@/components/ui/bottomSheet";
import type { BottomSheetMethods } from "@/components/ui/bottomSheet";
import {
  FileText,
  Info,
  Printer,
  RotateCcw,
  X,
} from "lucide-react-native";
import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";
import OrderDetailSkeleton from "./detail/OrderDetailSkeleton";
import OrderReceipt from "./detail/OrderReceipt";
import DetailsPanel from "./detail/DetailsPanel";
import TimelineTab from "./detail/TimelineTab";

interface OrderDetailsBottomSheetProps {
  order: OrderProfile | null;
  onClose: () => void;
  onPrint?: (order: OrderProfile) => void;
  onRefund?: (order: OrderProfile) => void;
}

type TabType = "details" | "timeline";

const OrderDetailsBottomSheet = forwardRef<
  BottomSheetMethods,
  OrderDetailsBottomSheetProps
>(({ order, onClose, onPrint, onRefund }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["95%"], []);
  const [selectedTab, setSelectedTab] = useState<TabType>("details");
  const [initialTab, setInitialTab] = useState<TabType | null>(null);

  // Fetch full order details via TanStack Query
  const { data: orderDetail, isLoading: isDetailLoading } = useOrderDetails(
    order?.db_order_id,
  );

  useImperativeHandle(ref, () => ({
    snapToIndex: (index: number) => {
      // Reset tab to initial if set, otherwise default to "details"
      setSelectedTab(initialTab || "details");
      setInitialTab(null);
      bottomSheetRef.current?.snapToIndex(index);
    },
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

  const statusHistory = orderDetail?.status_history;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      {...bottomSheetTheme}
      onClose={onClose}
    >
      <BottomSheetView className="flex-1 bg-screen">
        {/* Header */}
        <View className="px-4 py-3 border-b border-border">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="bg-blue-900/30 border border-blue-500 px-3 py-1 rounded-lg">
                <Text className="text-blue-400 font-bold">
                  {order.display_number || order.order_number || order.id}
                </Text>
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
              <View className="bg-green-900/30 border border-green-500 px-2 py-1 rounded">
                <Text className="text-green-400 font-bold text-sm">
                  {order.paid_status || "Unpaid"}
                </Text>
              </View>
              <View
                className={`px-2 py-1 rounded ${order.check_status === "Closed" ? "bg-gray-700" : "bg-emerald-900/30"}`}
              >
                <Text
                  className={`text-xs font-semibold ${order.check_status === "Closed" ? "text-gray-300" : "text-emerald-400"}`}
                >
                  {order.check_status === "Closed" ? "Closed" : "Open"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              className="p-2 rounded-full bg-gray-700"
            >
              <X color={colors.label} size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {isDetailLoading ? (
          <OrderDetailSkeleton />
        ) : (
          <View className="flex-1 flex-row">
            {/* Left Panel — Receipt */}
            <View className="border-r border-border" style={{ width: 380 }}>
              <OrderReceipt order={order} />
            </View>

            {/* Right Panel — Tabs */}
            <View className="flex-1">
              {/* Tab Bar */}
              <View className="flex-row border-b border-border px-4">
                <TabButton
                  icon={
                    <Info
                      size={16}
                      color={selectedTab === "details" ? "#3B82F6" : "#9CA3AF"}
                    />
                  }
                  label="Details"
                  isActive={selectedTab === "details"}
                  onPress={() => setSelectedTab("details")}
                />
                <TabButton
                  icon={
                    <FileText
                      size={16}
                      color={selectedTab === "timeline" ? "#3B82F6" : "#9CA3AF"}
                    />
                  }
                  label="Timeline"
                  isActive={selectedTab === "timeline"}
                  onPress={() => setSelectedTab("timeline")}
                />
              </View>

              {/* Tab Content */}
              <View className="flex-1">
                {selectedTab === "details" && (
                  <DetailsPanel order={order} />
                )}
                {selectedTab === "timeline" && (
                  <TimelineTab
                    order={order}
                    statusHistory={statusHistory}
                  />
                )}
              </View>
            </View>
          </View>
        )}

        {/* Bottom Action Bar */}
        <View className="px-4 py-3 border-t border-border bg-screen">
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
              <RotateCcw color="#FFFFFF" size={20} />
              <Text className="text-white font-semibold">Refund</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleClose}
              className="flex-1 flex-row items-center justify-center gap-2 py-3 bg-gray-600 rounded-lg"
            >
              <X color="#FFFFFF" size={20} />
              <Text className="text-white font-semibold">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

const TabButton = ({
  icon,
  label,
  isActive,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className={`flex-row items-center gap-2 py-3 px-4 border-b-2 ${
      isActive ? "border-blue-500" : "border-transparent"
    }`}
  >
    {icon}
    <Text
      className={`font-semibold ${
        isActive ? "text-blue-500" : "text-gray-400"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

OrderDetailsBottomSheet.displayName = "OrderDetailsBottomSheet";

export default OrderDetailsBottomSheet;
