import { useMenuStore } from "@/stores/useMenuStore";
import type { TriggerRef } from '@rn-primitives/select';
import React from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { menus, categories: storeCategories, isMenuAvailableNow, isCategoryAvailableNow, isCategoryActiveForMenu } = useMenuStore();
  const visibleMenus = menus.filter((m) => m.isActive && isMenuAvailableNow(m.id));
  const currentMenu = visibleMenus.find((menu) => menu.name === activeMeal);
  const categories = currentMenu?.categories;
  const ref = React.useRef<TriggerRef>(null);
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: Platform.select({ ios: insets.bottom, android: insets.bottom + 24 }),
    left: 12,
    right: 12,
  };

  // Workaround for rn-primitives/select not opening on mobile
  // function onTouchStart() {
  //   ref.current?.open();
  // }
  return (
    <View className="flex-row justify-between items-start gap-4">
      {/* Left Section: All Tabs */}
      <View className="bg-[#303030] w-full p-2 rounded-2xl flex-shrink flex flex-row items-center justify-between">
        {/* Meal Tabs */}
        {/* <View className="flex-row mx-auto">
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
        </View> */}

        {/* Category Pills Container */}
        <View className="flex-1 p-1 rounded-xl flex-row items-center gap-1">
          <ScrollView horizontal className=" p-1 rounded-lg w-fit bg-[#303030] " >
            {categories?.map((tab, index) => {
              const baseAvailable = isCategoryAvailableNow(tab);
              const catObj = storeCategories.find((c) => c.name === tab);
              const menuActive = currentMenu && catObj ? isCategoryActiveForMenu(currentMenu.id, catObj.id) : false;
              const available = baseAvailable && !!menuActive;
              const dotColor = available ? '#10B981' : '#EF4444';
              const isDisabled = !available;

              return (
                <View key={tab} className='w-fit flex-row items-center' >
                  <TouchableOpacity
                    onPress={() => !isDisabled && onCategoryChange(tab)}
                    className={`py-2 px-4 rounded-full flex-row items-center gap-2 ${activeCategory === tab
                      ? "border border-accent-300 bg-accent-100"
                      : isDisabled
                        ? "border border-gray-600 bg-gray-700 opacity-60"
                        : "border border-transparent"
                      }`}
                  >
                    {/* Availability dot */}
                    <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
                    <Text className={`font-semibold text-base ${activeCategory === tab
                      ? "text-accent-400"
                      : isDisabled
                        ? "text-gray-400"
                        : "text-accent-100"
                      }`}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                  <View className={`${index !== categories.length - 1 ? "border-r border-gray-400 h-[50%] mx-2" : ""}`} />
                </View>
              );
            })}
          </ScrollView>
        </View>


      </View>

    </View>
  );
};

export default MenuControls;
