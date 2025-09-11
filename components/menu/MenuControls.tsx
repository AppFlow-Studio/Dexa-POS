import { useMenuStore } from "@/stores/useMenuStore";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

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
  const { menus, isMenuAvailableNow, isCategoryAvailableNow } = useMenuStore();
  const visibleMenus = menus.filter((m) => m.isActive && isMenuAvailableNow(m.id));
  const categories = visibleMenus.find((menu) => menu.name == activeMeal)?.categories
  return (
    <View className="flex-row justify-between items-start gap-4">
      {/* Left Section: All Tabs */}
      <View className="bg-[#303030] border border-background-200 p-2 rounded-2xl flex-shrink">
        {/* Meal Tabs */}
        <View className="flex-row mx-auto">
          {visibleMenus?.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => {
                onMealChange(tab.name)
                onCategoryChange(tab.categories[0])
              }}
              className={`py-2 px-5 rounded-t-lg ${activeMeal === tab.name ? "bg-background-200 border border-b-background-200 text-black" : "bg-transparent text-white"}`}
            >
              <Text className={ `font-semibold text-lg  ${activeMeal === tab.name ?  "text-black" : "text-white"}` }>
                {tab.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category Pills Container */}
        <View className="bg-background-200  border p-1 rounded-xl flex-row items-center gap-1">
          {categories?.map((tab) => {
            const available = isCategoryAvailableNow(tab);
            const dotColor = available ? '#10B981' : '#EF4444';
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => onCategoryChange(tab)}
                className={`py-2 px-4 rounded-full flex-row items-center gap-2 ${activeCategory === tab ? "border border-accent-300 bg-accent-100" : "border border-transparent"}`}
              >
                {/* Availability dot */}
                <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
                <Text className={"font-semibold text-base text-accent-400"}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

    </View>
  );
};

export default MenuControls;
