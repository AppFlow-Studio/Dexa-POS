import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
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
// Get image source for preview
const getImageSource = (item: MenuItemType) => {
  if (item.image && item.image.length > 200) {
      return { uri: `data:image/jpeg;base64,${item.image}` };
  }

  if (item.image) {
      // Try to get image from assets
      try {
          return MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
      } catch {
          return undefined;
      }
  }

  return undefined;
};
const MenuSection: React.FC<MenuSectionProps> = ({ onOrderClosedCheck }) => {
  // State for the active filters
  const { menuItems, menus, isCategoryAvailableNow } = useMenuStore();

  const [activeMeal, setActiveMeal] = useState(menus[0].name);
  const [activeCategory, setActiveCategory] = useState(menus[0].categories[0]);
  const { isOpen, mode, cartItem, close } = useModifierSidebarStore();
  // State to hold the items that are actually displayed after filtering
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItemType[]>(
    []
  );
  const { openSearch } = useSearchStore();


  useEffect(() => {
    const filtered = menuItems.filter((item) => {
      const categoryMatch = item.category.includes(activeCategory);
      const categoryAvailable = isCategoryAvailableNow(activeCategory);
      return categoryMatch && categoryAvailable;
    });
    setFilteredMenuItems(filtered);
  }, [activeMeal, activeCategory, isCategoryAvailableNow]);

  // Show modifier screen when in fullscreen mode (both add and edit), otherwise show regular menu
  if (isOpen && mode === "fullscreen") {
    return <ModifierScreen />;
  }

  return (
    <>
      <View className="mt-6 flex-1 border-gray-700 pr-4 bg-[#212121]">
        <View className="flex flex-row items-center justify-between pb-4">
          <Text className="text-2xl font-bold text-white">Menu</Text>
          {/* Right Section: Search Bar - Now positioned at the bottom */}
          <View className="w-[50%]">
            <TouchableOpacity
              onPress={openSearch}
              className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start"
            >
              <Search color="#9CA3AF" size={16} />
              <Text className="text-gray-300 ml-4">Search</Text>
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
              <Text className="text-gray-400 text-lg">
                No items match the current filters.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MenuItem
              item={item}
              imageSource={
                getImageSource(item)
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
