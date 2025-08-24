import BillSection from "@/components/bill/BillSection";
import SelectPaymentMethodModal from "@/components/bill/SelectPaymentMethodModal";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();

  const [isPaymentSelectOpen, setPaymentSelectOpen] = useState(false);

  const { tables, updateTableStatus } = useFloorPlanStore();
  const {
    orders,
    activeOrderId,
    setActiveOrder,
    startNewOrder,
    assignOrderToTable,
    updateOrderStatus,
    updateActiveOrderDetails,
  } = useOrderStore();
  const { setActiveTableId, clearActiveTableId } = usePaymentStore();

  const table = tables.find((t) => t.id === tableId);
  // Find if an order is ALREADY assigned to this table
  const existingOrderForTable = orders.find(
    (o) =>
      o.service_location_id === tableId &&
      (o.order_status === "Preparing" || "Reday")
  );

  // --- Core Logic ---
  useEffect(() => {
    if (table?.status === "Needs Cleaning") {
      router.push("/tables");
      return;
    }
  }, []);

  useEffect(() => {
    if (existingOrderForTable) {
      // If we navigated to a table that's already in use, make its order active.
      setActiveOrder(existingOrderForTable.id);
    } else {
      // If the table is AVAILABLE, create a NEW, unassigned order and make IT active.
      const newUnassignedOrder = startNewOrder();
      setActiveOrder(newUnassignedOrder.id);
      updateActiveOrderDetails({ order_type: "Dine In" });
    }

    return () => setActiveOrder(null);
  }, [tableId, existingOrderForTable, setActiveOrder, startNewOrder]);

  useEffect(() => {
    if (tableId) {
      setActiveTableId(tableId as string);
    }

    return () => {
      clearActiveTableId();
    };
  }, [tableId]);

  const handleAssignToTable = () => {
    if (activeOrderId && tableId) {
      // This is the key action. It links the active order to the table
      assignOrderToTable(activeOrderId, tableId as string);
      updateTableStatus(tableId as string, "In Use");
      updateOrderStatus(activeOrderId, "Preparing");
      router.push("/tables");
    }
  };

  const handlePay = () => {
    const order = orders.find((o) => o.id === activeOrderId);
    if (order) {
      if (order.order_status === "Preparing") {
        toast.error("The order is not yet ready", {
          duration: 4000,
          position: ToastPosition.BOTTOM,
        });
        return;
      }
    }
    setPaymentSelectOpen(true);
  };

  if (!table) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-bold text-red-500">
          Table not found!
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* --- Customer Info Section (Top) --- */}
      <View className="px-2 mt-2">
        <OrderInfoHeader />
      </View>

      <View className="flex-1 flex-row ">
        <View className="flex-1 p-6 px-4 pt-0">
          <MenuSection />
        </View>
        <BillSection showOrderDetails={false} showPlaymentActions={false} />
      </View>

      {/* --- Fixed Footer (Not Scrollable) --- */}
      <View className="bg-white border-t border-gray-200 p-4 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <AlertCircle color="#f97316" size={20} />
          <Text className="font-semibold text-gray-600">
            Table No. {table.name}, Table Size - Medium, {table.capacity}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="px-8 py-3 rounded-lg border border-gray-300"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity>
          {existingOrderForTable ? (
            <TouchableOpacity
              onPress={handlePay}
              className="px-8 py-3 rounded-lg bg-primary-400"
            >
              <Text className="font-bold text-white">Pay</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="px-8 py-3 rounded-lg bg-primary-400"
              onPress={handleAssignToTable}
            >
              <Text className="font-bold text-white">Take Order</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <SelectPaymentMethodModal
        isOpen={isPaymentSelectOpen}
        onClose={() => setPaymentSelectOpen(false)}
      />
    </View>
  );
};

export default UpdateTableScreen;
