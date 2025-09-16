import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const PurchaseOrderDetailScreen = () => {
  const router = useRouter();
  const { poId } = useLocalSearchParams();
  const { purchaseOrders, vendors, inventoryItems, receivePurchaseOrder } =
    useInventoryStore();

  const po = purchaseOrders.find((p) => p.id === poId);
  const vendor = po ? vendors.find((v) => v.id === po.vendorId) : null;

  if (!po) {
    return (
      <View>
        <Text className="text-white">Purchase Order not found.</Text>
      </View>
    );
  }

  const totalCost = po.items.reduce(
    (acc, item) => acc + item.cost * item.quantity,
    0
  );
  const isReceived = po.status === "Received";

  const handleReceive = () => {
    if (isReceived || !poId) return;
    receivePurchaseOrder(poId as string);

    toast.success(`Stock received for PO #${po.poNumber}`, {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
    router.back();
  };

  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-2xl font-bold text-white">
          PO Details: {po.poNumber}
        </Text>
        <TouchableOpacity
          onPress={handleReceive}
          disabled={isReceived}
          className={`py-3 px-5 rounded-lg ${isReceived ? "bg-gray-500" : "bg-green-600"}`}
        >
          <Text className="font-bold text-white">
            {isReceived ? "Stock Received" : "Receive Stock"}
          </Text>
        </TouchableOpacity>
      </View>

      <View className="bg-[#303030] border border-gray-700 rounded-xl p-6">
        <View className="flex-row justify-between mb-4">
          <View>
            <Text className="text-gray-400">Vendor</Text>
            <Text className="text-white text-lg font-semibold">
              {vendor?.name || "Unknown"}
            </Text>
          </View>
          <View>
            <Text className="text-gray-400">Status</Text>
            <Text className="text-white text-lg font-semibold">
              {po.status}
            </Text>
          </View>
          <View>
            <Text className="text-gray-400">Total Cost</Text>
            <Text className="text-white text-lg font-semibold">
              ${totalCost.toFixed(2)}
            </Text>
          </View>
        </View>

        <Text className="text-lg font-semibold text-white mt-4 mb-2">
          Items
        </Text>
        <FlatList
          data={po.items}
          keyExtractor={(item) => item.inventoryItemId}
          renderItem={({ item }) => {
            const invItem = inventoryItems.find(
              (i) => i.id === item.inventoryItemId
            );
            return (
              <View className="flex-row justify-between p-3 border-b border-gray-600">
                <Text className="text-white flex-1">{invItem?.name}</Text>
                <Text className="text-gray-300 w-32">
                  {item.quantity} {invItem?.unit}
                </Text>
                <Text className="text-gray-300 w-32">
                  ${(item.cost * item.quantity).toFixed(2)}
                </Text>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
};

export default PurchaseOrderDetailScreen;
