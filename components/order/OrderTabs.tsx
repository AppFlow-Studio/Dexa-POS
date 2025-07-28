import React, { useState } from "react";
// 1. IMPORTANT: Import Pressable directly from 'react-native'
import { Pressable, Text, View } from "react-native";

// Define types for props
type TabName = "All" | "Dine In" | "Take Away" | "Delivery";

interface Tab {
  name: TabName;
  count?: number;
}

interface OrderTabsProps {
  onTabChange: (tab: TabName) => void;
}

const TABS: Tab[] = [
  { name: "All", count: 14 },
  { name: "Dine In" },
  { name: "Take Away" },
  { name: "Delivery" },
];

const OrderTabs: React.FC<OrderTabsProps> = ({ onTabChange }) => {
  const [activeTab, setActiveTab] = useState<TabName>("All");

  const handlePress = (tabName: TabName) => {
    setActiveTab(tabName);
    onTabChange(tabName);
  };

  return (
    <View className="bg-gray-100 p-1 rounded-xl flex-row self-start mt-4">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.name;
        return (
          <Pressable
            key={tab.name}
            onPress={() => handlePress(tab.name)}
            className={`py-2.5 px-4 rounded-lg flex-row items-center ${
              isActive ? "bg-white shadow" : ""
            }`}
          >
            <Text
              className={`font-semibold ${
                isActive ? "text-gray-800" : "text-gray-500"
              }`}
            >
              {tab.name}
            </Text>
            {tab.count && (
              <View className="bg-blue-500 rounded-full w-6 h-6 items-center justify-center ml-2">
                <Text className="text-white font-bold text-xs">
                  {tab.count}
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
