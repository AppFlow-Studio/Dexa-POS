import { MenuItemType } from "@/lib/types";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";
import MenuControls from "./MenuControls";
import MenuItem from "./MenuItem";

// Mock Data for the menu items
const mockMenuItems: MenuItemType[] = [
  {
    id: "1",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "2",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "3",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5 /* No image */,
  },
  {
    id: "4",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "5",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "6",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "7",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5 /* No image */,
  },
  {
    id: "8",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "9",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "10",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "11",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
  {
    id: "12",
    name: "Deluxe Crispyburger",
    price: 6.99,
    cashPrice: 6.5,
    image: "https://placehold.co/300x200/F7D0B1/422C18?text=Burger",
  },
];

const MenuSection: React.FC = () => {
  // State to track which menu item is currently selected
  const [selectedItemId, setSelectedItemId] = useState<string | null>("5"); // Pre-select item with ID '5'

  return (
    <View className="mt-6 flex-1">
      <Text className="text-2xl font-bold text-gray-800">Menu</Text>
      <MenuControls />
      <FlatList
        data={mockMenuItems}
        keyExtractor={(item) => item.id}
        numColumns={3}
        className="mt-4"
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        renderItem={({ item }) => (
          <MenuItem
            item={item}
            isSelected={selectedItemId === item.id}
            onPress={() => setSelectedItemId(item.id)}
          />
        )}
      />
    </View>
  );
};

export default MenuSection;
