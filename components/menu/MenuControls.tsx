import { useSearchStore } from "@/stores/searchStore";
import { Search } from "lucide-react-native";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const MEAL_TABS = ["Lunch", "Dinner", "Brunch", "Specials"];
const CATEGORY_TABS = [
  "Appetizers",
  "Main Course",
  "Sides",
  "Drinks",
  "Dessert",
];

// Define the props the component will receive
interface MenuControlsProps {
  activeMeal: string;
  onMealChange: (meal: string) => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

const MenuControls: React.FC<MenuControlsProps> = ({
  activeMeal,
  onMealChange,
  activeCategory,
  onCategoryChange,
}) => {
  const { openSearch } = useSearchStore();
  return (
    <View className="flex-row justify-between items-start gap-4 space-x-4">
      {/* Left Section: All Tabs */}
      <View className="bg-background-300 border border-background-400 p-2 rounded-2xl flex-shrink">
        {/* Meal Tabs */}
        <View className="flex-row mx-auto">
          {MEAL_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => onMealChange(tab)}
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
              onPress={() => onCategoryChange(tab)}
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
        <TouchableOpacity
          onPress={openSearch}
          className="flex-row items-center bg-background-300 border border-background-400 rounded-2xl px-4 py-1 mt-14"
        >
          <Search color="#5D5D73" size={22} />
          <TextInput
            placeholder="Search Item"
            className="ml-3 flex-1"
            placeholderTextColor="#5D5D73"
            onPress={openSearch}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MenuControls;
