import { PurchaseOrder } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const PurchaseOrderRow: React.FC<{ item: PurchaseOrder }> = ({ item }) => {
  const router = useRouter();
  const vendors = useInventoryStore((state) => state.vendors);
  const vendor = vendors.find((v) => v.id === item.vendorId);
  const totalItems = item.items.reduce(
    (acc, current) => acc + current.quantity,
    0
  );
  const totalCost = item.items.reduce(
    (acc, current) => acc + current.cost * current.quantity,
    0
  );

  const statusColors = {
    Draft: "bg-gray-700 text-gray-200",
    Sent: "bg-blue-600 text-white",
    Received: "bg-green-600 text-white",
    Cancelled: "bg-red-600 text-white",
  };

  return (
    <TouchableOpacity
      onPress={() => router.push(`/inventory/purchase-orders/${item.id}`)}
      className="flex-row items-center p-4 border-b border-gray-700"
    >
      <Text className="w-1/6 font-semibold text-white">{item.poNumber}</Text>
      <Text className="w-1/6 text-gray-300">{vendor?.name || "Unknown"}</Text>
      <View className="w-1/6">
        <View
          className={`px-3 py-1 rounded-full self-start ${statusColors[item.status]}`}
        >
          <Text className={`font-bold text-xs ${statusColors[item.status]}`}>
            {item.status}
          </Text>
        </View>
      </View>
      <Text className="w-1/6 text-gray-300">
        {new Date(item.createdAt).toLocaleDateString()}
      </Text>
      <Text className="w-1/6 text-gray-300">{totalItems}</Text>
      <Text className="w-1/6 font-semibold text-white">
        ${totalCost.toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
};

const PurchaseOrdersScreen = () => {
  const purchaseOrders = useInventoryStore((state) => state.purchaseOrders);
  const router = useRouter();

  const TABLE_HEADERS = [
    "PO Number",
    "Vendor",
    "Status",
    "Date Created",
    "Total Items",
    "Total Cost",
  ];

  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-2xl font-bold text-white">Purchase Orders</Text>
        <TouchableOpacity
          onPress={() => router.push("/inventory/purchase-orders/create")}
          className="py-3 px-5 bg-blue-600 rounded-lg flex-row items-center"
        >
          <Plus color="white" size={18} className="mr-2" />
          <Text className="font-bold text-white">Create PO</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
        <View className="flex-row p-4 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
          {TABLE_HEADERS.map((header) => (
            <Text
              key={header}
              className="w-1/6 font-bold text-sm text-gray-400"
            >
              {header}
            </Text>
          ))}
        </View>
        <FlatList
          data={purchaseOrders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PurchaseOrderRow item={item} />}
          ListEmptyComponent={
            <View className="p-8 items-center">
              <Text className="text-gray-400">
                No purchase orders created yet.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
};

export default PurchaseOrdersScreen;
