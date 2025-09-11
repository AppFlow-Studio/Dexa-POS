import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useItemStore } from "@/stores/useItemStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { Search } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import MenuControls from "./MenuControls";
import MenuItem from "./MenuItem";
import ModifierScreen from "./ModifierScreen";

interface MenuSectionProps {
  onOrderClosedCheck?: () => boolean;
}

const MenuSection: React.FC<MenuSectionProps> = ({ onOrderClosedCheck }) => {
  // State for the active filters
  const [activeMeal, setActiveMeal] = useState("Dinner");
  const [activeCategory, setActiveCategory] = useState("Main Course");
  const { isOpen, mode, cartItem, close } = useModifierSidebarStore();

  const { items } = useItemStore();

  // State to hold the items that are actually displayed after filtering
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItemType[]>(
    []
  );
  const { openSearch } = useSearchStore();

  useEffect(() => {
    const filtered = items.filter((item) => {
      // Only show items that are marked as available
      if (!item.availability) {
        return false;
      }
      const mealMatch = item.meal.includes(activeMeal as any);
      const categoryMatch = item.category === activeCategory;
      return mealMatch && categoryMatch;
    });
    setFilteredMenuItems(filtered);
  }, [activeMeal, activeCategory, items]);

  // Show modifier screen when in fullscreen mode (both add and edit), otherwise show regular menu
  if (isOpen && mode === "fullscreen") {
    return <ModifierScreen />;
  }

  return (
    <>
      <View className="mt-6 flex-1 border-r border-gray-300 pr-4">
        <View className="flex flex-row items-center justify-between pb-4">
          <Text className="text-2xl font-bold text-gray-800 ">Menu</Text>
          {/* Right Section: Search Bar - Now positioned at the bottom */}
          <View className="w-[50%]">
            <TouchableOpacity
              onPress={openSearch}
              className="flex-row items-center bg-background-300 border border-background-400 rounded-lg px-4 py-3 justify-start"
            >
              <Search color="#5D5D73" size={16} />
              <Text className="text-gray-600 ml-4">Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        <MenuControls
          activeMeal={activeMeal}
          onMealChange={setActiveMeal}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />

        <FlatList
          data={filteredMenuItems}
          keyExtractor={(item) => item.id}
          numColumns={3}
          className="mt-4"
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ gap: 16 }}
          removeClippedSubviews={false}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center h-48">
              <Text className="text-gray-500 text-lg">
                No items match the current filters.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MenuItem
              item={item}
              imageSource={
                item.image
                  ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
                  : undefined
              }
              onOrderClosedCheck={onOrderClosedCheck}
            />
          )}
        />
      </View>
    </>
  );
};

export default MenuSection;
