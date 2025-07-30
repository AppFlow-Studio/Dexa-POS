import { MENU_IMAGE_MAP, MOCK_MENU_ITEMS } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import MenuControls from "./MenuControls";
import MenuItem from "./MenuItem";

const MenuSection: React.FC = () => {
  // State for the active filters
  const [activeMeal, setActiveMeal] = useState("Dinner");
  const [activeCategory, setActiveCategory] = useState("Main Course");

  // State to hold the items that are actually displayed after filtering
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItemType[]>(
    []
  );

  // State to track which menu item is currently selected
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    const filtered = MOCK_MENU_ITEMS.filter((item) => {
      const mealMatch = item.meal.includes(activeMeal as any);
      const categoryMatch = item.category === activeCategory;
      return mealMatch && categoryMatch;
    });
    setFilteredMenuItems(filtered);
  }, [activeMeal, activeCategory]);
  return (
    <View className="mt-6 flex-1">
      <Text className="text-2xl font-bold text-gray-800 mb-4">Menu</Text>
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
            isSelected={selectedItemId === item.id}
            onPress={() => setSelectedItemId(item.id)}
            imageSource={
              item.image
                ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
                : undefined
            }
          />
        )}
      />
    </View>
  );
};

export default MenuSection;
