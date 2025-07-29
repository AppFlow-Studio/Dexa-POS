import { Search } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const MEAL_TABS = ["Lunch", "Dinner", "Brunch", "Specials"];
const CATEGORY_TABS = [
  "Appetizers",
  "Main Course",
  "Sides",
  "Drinks",
  "Dessert",
];

const MenuControls: React.FC = () => {
  const [activeMeal, setActiveMeal] = useState("Dinner");
  const [activeCategory, setActiveCategory] = useState("Appetizers");

  return (
    <View className="flex-row justify-between items-start gap-4 space-x-4">
      {/* Left Section: All Tabs */}
      <View className="bg-background-300 border border-background-400 p-2 rounded-2xl flex-shrink">
        {/* Meal Tabs */}
        <View className="flex-row mx-auto">
          {MEAL_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveMeal(tab)}
              className={`py-2 px-5 rounded-t-lg ${activeMeal === tab ? "bg-white" : "bg-transparent"}`}
            >
              <Text className={"font-semibold text-lg text-accent-500"}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category Pills Container */}
        <View className="bg-white p-1 rounded-xl flex-row items-center space-x-1">
          {CATEGORY_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveCategory(tab)}
              className={`py-2 px-4 rounded-full ${activeCategory === tab ? "border border-accent-300" : "border border-transparent"}`}
            >
              <Text className={"font-semibold text-base text-accent-400"}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Right Section: Search Bar - Now positioned at the bottom */}
      <View className="flex-1 justify-end">
        <View className="flex-row items-center bg-gray-100 rounded-2xl px-4 py-2 mt-12">
          <Search color="#6b7280" size={22} />
          <TextInput
            placeholder="Search Item"
            className="ml-3 flex-1"
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>
    </View>
  );
};

export default MenuControls;
