import { colors } from "@/lib/theme";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { Check, ChevronDown, ChevronUp, List } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DAY_OPTIONS = [
  { value: 0, label: "Today Only", description: "Only show orders from today" },
  { value: 1, label: "Last 2 Days", description: "Today and yesterday" },
  { value: 2, label: "Last 3 Days", description: "Today and 2 previous days" },
  { value: 6, label: "Last 7 Days", description: "Orders from the past week" },
  { value: 13, label: "Last 14 Days", description: "Orders from the past 2 weeks" },
  { value: 29, label: "Last 30 Days", description: "Orders from the past month" },
];

const OrderLineSettingsScreen = () => {
  const orderLineSettings = useSettingsStore((s) => s.orderLineSettings);
  const setOrderLineSettings = useSettingsStore((s) => s.setOrderLineSettings);

  const [expandedSections, setExpandedSections] = useState({
    visibility: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      className="flex-row items-center justify-between p-4 bg-surface rounded-t-xl border-b border-gray-700"
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3">
          {icon}
        </View>
        <Text className="text-white font-bold text-lg">{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color={colors.label} />
      ) : (
        <ChevronDown size={20} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-screen p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">
          Order Line Settings
        </Text>
        <Text className="text-gray-400 mt-2">
          Configure how orders appear in the order line.
        </Text>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Order Visibility */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Order Visibility",
            <List size={20} color={colors.info} />,
            "visibility"
          )}
          {expandedSections.visibility && (
            <View className="p-5">
              <Text className="text-gray-400 text-sm mb-4">
                Choose how many days of orders to display in the order line.
                Older orders will be hidden from the order line but can still be
                found in order history.
              </Text>

              {DAY_OPTIONS.map((option) => {
                const isSelected = orderLineSettings.daysToShow === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() =>
                      setOrderLineSettings({ daysToShow: option.value })
                    }
                    className={`flex-row items-center justify-between p-4 rounded-lg mb-2 border ${
                      isSelected
                        ? "bg-teal/10 border-teal"
                        : "bg-surface border-gray-600"
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`font-medium text-base ${
                          isSelected ? "text-blue-400" : "text-white"
                        }`}
                      >
                        {option.label}
                      </Text>
                      <Text className="text-gray-400 text-sm mt-1">
                        {option.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="w-6 h-6 bg-teal rounded-full items-center justify-center ml-3">
                        <Check size={14} color="#ffffff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default OrderLineSettingsScreen;
