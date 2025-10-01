import { useInventoryStore } from "@/stores/useInventoryStore";
import React, { useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

type ReportTab =
  | "On Hand"
  | "Low Stock"
  | "Sales Velocity"
  | "COGS"
  | "Variance"
  | "Vendor Performance";

const REPORT_TABS: ReportTab[] = [
  "On Hand",
  "Low Stock",
  "Sales Velocity",
  "COGS",
  "Variance",
  "Vendor Performance",
];

// --- Report Components ---

const OnHandReport = () => {
  const items = useInventoryStore((state) => state.inventoryItems);
  const headers = [
    "Name",
    "Category",
    "Stock Qty",
    "Unit",
    "Cost",
    "Total Value",
  ];

  return (
    <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
      <View className="flex-row p-4 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
        {headers.map((h) => (
          <Text key={h} className="w-1/6 font-bold text-lg text-gray-400">
            {h}
          </Text>
        ))}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="flex-row items-center p-4 border-b border-gray-700">
            <Text className="w-1/6 text-xl text-white">{item.name}</Text>
            <Text className="w-1/6 text-xl text-gray-300">{item.category}</Text>
            <Text className="w-1/6 text-xl text-white">
              {item.stockQuantity}
            </Text>
            <Text className="w-1/6 text-xl text-gray-300">{item.unit}</Text>
            <Text className="w-1/6 text-xl text-gray-300">
              ${item.cost.toFixed(2)}
            </Text>
            <Text className="w-1/6 text-xl text-white font-semibold">
              ${(item.stockQuantity * item.cost).toFixed(2)}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

// --- Corrected LowStockReport Component ---
const LowStockReport = () => {
  // 1. Select the raw, stable array from the store.
  const inventoryItems = useInventoryStore((state) => state.inventoryItems);

  // 2. Use useMemo to compute the derived state. This will only re-run when `inventoryItems` changes.
  const lowStockItems = useMemo(
    () =>
      inventoryItems.filter(
        (item) => item.stockQuantity <= item.reorderThreshold
      ),
    [inventoryItems]
  );

  const headers = ["Name", "Category", "Stock Qty", "Threshold", "Vendor"];

  return (
    <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
      <View className="flex-row p-2 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
        {headers.map((h) => (
          <Text key={h} className="w-1/5 font-bold text-lg text-gray-400">
            {h}
          </Text>
        ))}
      </View>
      <FlatList
        data={lowStockItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="flex-row items-center p-2 border-b border-gray-700">
            <Text className="w-1/5 text-lg text-white">{item.name}</Text>
            <Text className="w-1/5 text-lg text-gray-300">{item.category}</Text>
            <Text className="w-1/5 text-lg text-red-400 font-bold">
              {item.stockQuantity}
            </Text>
            <Text className="w-1/5 text-lg text-gray-300">
              {item.reorderThreshold}
            </Text>
            <Text className="w-1/5 text-lg text-gray-300">{item.vendorId}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View className="p-4 items-center">
            <Text className="text-lg text-gray-400">
              No items are currently low on stock.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const PlaceholderReport = ({ title }: { title: string }) => (
  <View className="flex-1 justify-center items-center bg-[#303030] border border-gray-700 rounded-xl">
    <Text className="text-xl text-gray-500">{title}</Text>
    <Text className="text-lg text-gray-600 mt-2">(Coming Soon)</Text>
  </View>
);

const ReportsScreen = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>("On Hand");

  const renderContent = () => {
    switch (activeTab) {
      case "On Hand":
        return <OnHandReport />;
      case "Low Stock":
        return <LowStockReport />;
      case "Sales Velocity":
        return <PlaceholderReport title="Sales Velocity Report" />;
      case "COGS":
        return <PlaceholderReport title="Cost of Goods Sold Report" />;
      case "Variance":
        return <PlaceholderReport title="Inventory Variance Report" />;
      case "Vendor Performance":
        return <PlaceholderReport title="Vendor Performance Report" />;
      default:
        return null;
    }
  };

  return (
    <View className="flex-1">
      <View className="mb-4">
        <Text className="text-lg font-semibold text-white mb-2">
          Select a Report
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {REPORT_TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`py-2 px-4 rounded-lg ${
                  isActive
                    ? "bg-blue-600"
                    : "bg-[#303030] border border-gray-700"
                }`}
              >
                <Text
                  className={`font-semibold text-lg ${
                    isActive ? "text-white" : "text-gray-300"
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {renderContent()}
    </View>
  );
};

export default ReportsScreen;
