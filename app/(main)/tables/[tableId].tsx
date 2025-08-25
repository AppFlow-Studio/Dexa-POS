import BillSection from "@/components/bill/BillSection";
import SelectPaymentMethodModal from "@/components/bill/SelectPaymentMethodModal";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();

  const [isPaymentSelectOpen, setPaymentSelectOpen] = useState(false);
  const [isNotReadyConfirmOpen, setNotReadyConfirmOpen] = useState(false);

  const { tables, updateTableStatus } = useFloorPlanStore();
  const {
    orders,
    activeOrderId,
    setActiveOrder,
    startNewOrder,
    assignOrderToTable,
    updateOrderStatus,
    updateActiveOrderDetails,
    updateItemStatusInActiveOrder,
    closeActiveOrder
  } = useOrderStore();
  const { setActiveTableId, clearActiveTableId } = usePaymentStore();

  const table = tables.find((t) => t.id === tableId);
  // Find if an order is ALREADY assigned to this table (and not closed)
  const existingOrderForTable = orders.find(
    (o) =>
      o.service_location_id === tableId &&
      o.order_status !== "Closed"
  );
  const activeOrder = orders.find((o) => o.id === activeOrderId);

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
      const anyNotReady = order.items.some(
        (i) => (i.item_status || "Preparing") !== "Ready"
      );
      if (anyNotReady) {
        setNotReadyConfirmOpen(true);
        return;
      }
    }
    setPaymentSelectOpen(true);
  };

  const handleReopenCheck = () => {
    if (!activeOrderId) return;
    // Mark as pending to allow adding new items
    updateActiveOrderDetails({ paid_status: "Pending" });
    toast.success("Check reopened. You can add items now.", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleClearTable = () => {
    if (!tableId || !activeOrderId) return;
    // Move table to cleaning flow and close order
    updateTableStatus(tableId as string, "Needs Cleaning");
    closeActiveOrder()
    router.back()
    toast.success("Table marked for cleaning.", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
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
  console.log(activeOrder)

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

      {/* Per-item status tracker */}
      {activeOrder && activeOrder.items?.length > 0 && (
        <View className="bg-white border-t border-gray-200 p-4">
          <Text className="text-base font-bold text-accent-500 mb-3">
            Items Status
          </Text>
          <ScrollView className="max-h-56">
            {activeOrder.items.map((item) => {
              const isReady = (item.item_status || "Preparing") === "Ready";
              return (
                <View
                  key={item.id}
                  className="flex-row justify-between items-center py-2 border-b border-gray-100"
                >
                  <View className="flex-1 pr-2">
                    <Text className="font-semibold text-accent-500">
                      {item.name} x{item.quantity}
                    </Text>
                    <View
                      className={`mt-1 self-start px-2 py-0.5 rounded-full ${isReady ? "bg-green-100" : "bg-yellow-100"
                        }`}
                    >
                      <Text
                        className={`text-[10px] font-semibold ${isReady ? "text-green-800" : "text-yellow-800"
                          }`}
                      >
                        {isReady ? "Ready" : "Preparing"}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      updateItemStatusInActiveOrder(
                        item.id,
                        isReady ? "Preparing" : "Ready"
                      )
                    }
                    className={`px-3 py-2 rounded-lg ${isReady ? "bg-yellow-200" : "bg-green-500"
                      }`}
                  >
                    <Text
                      className={`text-xs font-bold ${isReady ? "text-yellow-900" : "text-white"
                        }`}
                    >
                      {isReady ? "Mark Preparing" : "Mark Ready"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* --- Fixed Footer (Not Scrollable) --- */}
      <View className="bg-white border-t border-gray-200 p-4 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <AlertCircle color="#f97316" size={20} />
          <Text className="font-semibold text-gray-600">
            Table No. {table.name}, Table Size - Medium, {table.capacity}
          </Text>
        </View>
        {/* Paid / Status badges for table order */}
        {activeOrder && (
          <View className="flex-row items-center gap-2">
            <View
              className={`px-2 py-1 rounded-full ${activeOrder.paid_status === "Paid"
                ? "bg-green-100"
                : activeOrder.paid_status === "Pending"
                  ? "bg-yellow-100"
                  : "bg-red-100"
                }`}
            >
              <Text
                className={`text-xs font-semibold ${activeOrder.paid_status === "Paid"
                  ? "text-green-800"
                  : activeOrder.paid_status === "Pending"
                    ? "text-yellow-800"
                    : "text-red-800"
                  }`}
              >
                {activeOrder.paid_status}
              </Text>
            </View>
            <View className="px-2 py-1 rounded-full bg-blue-100">
              <Text className="text-xs font-semibold text-blue-800">
                {activeOrder.order_status}
              </Text>
            </View>
          </View>
        )}
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="px-8 py-3 rounded-lg border border-gray-300"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity>
          {existingOrderForTable ? (
            activeOrder?.paid_status === "Paid" ? (
              <>
                <TouchableOpacity
                  onPress={handleReopenCheck}
                  className="px-8 py-3 rounded-lg bg-primary-400"
                >
                  <Text className="font-bold text-white">Reopen Check</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearTable}
                  className="px-8 py-3 rounded-lg border border-gray-300"
                >
                  <Text className="font-bold text-gray-700">Clear Table</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={handlePay}
                className="px-8 py-3 rounded-lg bg-primary-400"
              >
                <Text className="font-bold text-white">Pay</Text>
              </TouchableOpacity>
            )
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

      {/* Confirm: items not ready */}
      <AlertDialog open={isNotReadyConfirmOpen} onOpenChange={setNotReadyConfirmOpen}>
        <AlertDialogContent className="w-[500px] p-6 rounded-2xl bg-white">
          <Text className="text-xl font-bold text-accent-500 mb-2">
            Items not ready
          </Text>
          <Text className="text-accent-400 mb-6">
            Not all items are marked as ready. Proceed to payment?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setNotReadyConfirmOpen(false)}
              className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
            >
              <Text className="font-bold text-gray-700">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setNotReadyConfirmOpen(false);
                setPaymentSelectOpen(true);
              }}
              className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
            >
              <Text className="font-bold text-white">Continue</Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
};

export default UpdateTableScreen;
