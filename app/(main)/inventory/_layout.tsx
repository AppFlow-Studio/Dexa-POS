import { Slot, usePathname, useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Define the tabs for the inventory section
const INVENTORY_TABS = [
  { name: "Catalog", path: "/inventory" },
  { name: "Vendors", path: "/inventory/vendors" },
  { name: "Purchase Orders", path: "/inventory/purchase-orders" },
  { name: "Reports", path: "/inventory/reports" },
];

export default function InventoryLayout() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View className="flex-1 bg-[#212121] p-4">
      {/* Header with Navigation Tabs */}
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-2xl font-bold text-white">
          Inventory Management
        </Text>
        <View className="flex-row items-center bg-[#303030] border border-gray-700 p-1 rounded-xl">
          {INVENTORY_TABS.map((tab) => {
            const isActive = tab.path.split("/")[2] === pathname.split("/")[2];
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => router.push(tab.path as any)}
                className={`py-2 px-4 rounded-lg ${
                  isActive ? "bg-blue-600" : ""
                }`}
              >
                <Text
                  className={`font-semibold text-lg ${
                    isActive ? "text-white" : "text-gray-300"
                  }`}
                >
                  {tab.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Renders the currently active screen (index.tsx, vendors.tsx, etc.) */}
      <Slot />
    </View>
  );
}
