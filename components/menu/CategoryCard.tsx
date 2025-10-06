import { MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { Settings } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface CategoryCardProps {
  categoryName: string;
  isExpanded: boolean;
  onToggleExpand: (name: string) => void;
  onEdit: () => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  categoryName,
  isExpanded,
  onToggleExpand,
  onEdit,
}) => {
  const { getItemsInCategory, categories, getItemPriceForCategory } =
    useMenuStore();
  const categoryItems = getItemsInCategory(categoryName);
  const categoryDetails = categories.find((c) => c.name === categoryName);

  return (
    <View className="bg-[#303030] rounded-lg border border-gray-700 p-4 mb-3">
      <View className="flex-row justify-between items-center">
        <TouchableOpacity
          onPress={() => onToggleExpand(categoryName)}
          className="flex-row items-center gap-2 flex-1"
        >
          <Text className="font-medium text-white text-xl">{categoryName}</Text>
          <View className="bg-blue-900/30 border border-blue-500 px-2 py-1 rounded">
            <Text className="text-sm text-blue-400">
              {categoryItems.length} items
            </Text>
          </View>
        </TouchableOpacity>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={onEdit}
            className="p-2 bg-[#212121] rounded border border-gray-600"
          >
            <Settings size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>

      {isExpanded && (
        <View className="mt-3 gap-2">
          {categoryItems.length === 0 ? (
            <Text className="text-base text-gray-400">
              No items in this category.
            </Text>
          ) : (
            <View className="gap-2 flex flex-row flex-wrap">
              {categoryItems.map((item: MenuItemType) => (
                <View
                  key={item.id}
                  className="flex-row items-center justify-between bg-[#212121] border border-gray-700 rounded-md px-3 py-2"
                >
                  <Text className="text-base text-white">{item.name}</Text>
                  <Text className="text-base text-gray-300 ml-2">
                    $
                    {categoryDetails
                      ? getItemPriceForCategory(
                          item.id,
                          categoryDetails.id
                        ).toFixed(2)
                      : item.price.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export const DraggableMenuCategory = () => <View />; // Placeholder remains
