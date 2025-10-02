import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

// Define types for props
type TabName = "All" | "Dine In" | "Takeaway" | "Delivery";

interface Tab {
  name: TabName;
  count?: number;
}

interface OrderTabsProps {
  onTabChange: (tab: TabName) => void;
  totalOrder: number;
}

const OrderTabs: React.FC<OrderTabsProps> = ({ onTabChange, totalOrder }) => {
  const [activeWindow, setActiveWindow] = useState("All");
  const TABS: Tab[] = [
    { name: "All", count: totalOrder },
    { name: "Dine In" },
    { name: "Takeaway" },
    { name: "Delivery" },
  ];

  const handlePress = (tabName: TabName) => {
    setActiveWindow(tabName);
    onTabChange(tabName);
  };

  return (
    <View className="bg-[#303030] border border-gray-700 p-1 rounded-xl flex-row self-start">
      {TABS.map((tab) => {
        const isActive = activeWindow === tab.name;
        return (
          <Pressable
            key={tab.name}
            onPress={() => handlePress(tab.name)}
            className={`py-2 px-4 rounded-lg flex-row items-center ${
              isActive ? "bg-[#212121]" : ""
            }`}
          >
            <Text
              className={`font-semibold text-lg ${
                isActive ? "text-blue-400" : "text-gray-400"
              }`}
            >
              {tab.name}
            </Text>
            {tab.count !== undefined && tab.count > 0 && (
              <View className="bg-blue-600 rounded-md w-6 h-6 items-center justify-center ml-2">
                <Text className="text-white font-bold text-base">
                  {String(tab.count)}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

export default OrderTabs;
