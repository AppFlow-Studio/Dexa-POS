import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

// Define types for props
type TabName = "All" | "Dine In" | "Take Away" | "Delivery";

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
    { name: "Take Away" },
    { name: "Delivery" },
  ];

  const handlePress = (tabName: TabName) => {
    setActiveWindow(tabName);
    onTabChange(tabName);
  };

  return (
    <View className="bg-background-300 border border-background-400 p-1 rounded-xl flex-row self-start">
      {TABS.map((tab) => {
        const isActive = activeWindow === tab.name;
        return (
          <Pressable
            key={tab.name}
            onPress={() => handlePress(tab.name)}
            className={`py-2.5 px-4 rounded-lg flex-row items-center ${
              isActive ? "bg-white" : ""
            }`}
          >
            <Text
              className={`font-semibold ${
                isActive ? "text-primary-400" : "text-accent-400"
              }`}
            >
              {tab.name}
            </Text>
            {tab.count && (
              <View className="bg-primary-400 rounded-full w-6 h-6 items-center justify-center ml-2">
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
