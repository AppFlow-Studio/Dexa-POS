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
  counts: { [key in TabName]?: number };
}

const OrderTabs: React.FC<OrderTabsProps> = ({ onTabChange, counts }) => {
  const [activeWindow, setActiveWindow] = useState("All");
  const TABS: TabName[] = ["All", "Dine In", "Takeaway", "Delivery"];

  const handlePress = (tabName: TabName) => {
    setActiveWindow(tabName);
    onTabChange(tabName);
  };

  return (
    <View className="bg-[#303030] border border-gray-700 p-1 rounded-xl flex-row self-start">
      {TABS.map((tab) => {
        const isActive = activeWindow === tab;
        const tabCount = counts[tab];
        return (
          <Pressable
            key={tab}
            onPress={() => handlePress(tab)}
            className={`py-2 px-4 rounded-lg flex-row items-center ${
              isActive ? "bg-[#212121]" : ""
            }`}
          >
            <Text
              className={`font-semibold text-lg ${
                isActive ? "text-blue-400" : "text-gray-400"
              }`}
            >
              {tab}
            </Text>
            {tabCount !== undefined && tabCount > 0 && (
              <View className="bg-blue-600 rounded-md min-w-[24px] h-6 items-center justify-center ml-2 px-1">
                <Text className="text-white font-bold text-sm">
                  {String(tabCount)}
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
