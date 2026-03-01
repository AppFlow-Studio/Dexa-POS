import { colors } from "@/lib/theme";
import { MenuItemType } from "@/lib/types";
import { Link } from "expo-router";
import { Check, Edit, Eye, EyeOff, MoreHorizontal } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const MenuCatalogRow = React.memo(
  ({
    item,
    initialIsSelected,
    onToggle,
    onToggleAvailability,
    onOpenStockModal,
  }: {
    item: MenuItemType;
    initialIsSelected: boolean;
    onToggle: (id: string) => void;
    onToggleAvailability: (item: MenuItemType) => void;
    onOpenStockModal: (item: MenuItemType) => void;
  }) => {
    // 1. Local state for 0ms lag
    const [isSelected, setIsSelected] = useState(initialIsSelected);

    // 2. Sync with parent (e.g., if "Select All" is clicked in parent)
    React.useEffect(() => {
      setIsSelected(initialIsSelected);
    }, [initialIsSelected]);

    // 3. Instant Handler
    const handlePress = useCallback(() => {
      setIsSelected((prev) => !prev); // Visual update instantly
      onToggle(item.id); // Data update in background
    }, [item.id, onToggle]);

    const isLowStock =
      typeof item.stockQuantity === "number" &&
      typeof item.reorderThreshold === "number" &&
      item.stockQuantity <= item.reorderThreshold;

    return (
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        {/* 1. Checkbox (Outside Link) */}
        <View className="w-[6%]">
          <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.7}
            className={`h-6 w-6 items-center justify-center border rounded ${
              isSelected ? "bg-blue-600 border-blue-500" : "border-gray-600"
            }`}
          >
            {isSelected && <Check color="#fff" size={14} />}
          </TouchableOpacity>
        </View>

        {/* 2. Content (Inside Link) */}
        <Link href={`/inventory/menu-items/${item.id}`} asChild>
          <TouchableOpacity className="flex-row w-[84%] items-center">
            <View className="w-[28.57%] flex-row items-center pr-2">
              <Text className="text-white text-xl flex-1" numberOfLines={1}>
                {item.name}
              </Text>
            </View>

            <Text className="text-gray-300 text-xl w-[17.86%]">
              ${item.price.toFixed(2)}
            </Text>

            <View className="w-[17.86%] flex-row items-center justify-center">
              <Text
                className={`text-xl ${
                  isLowStock ? "text-red-400" : "text-gray-300"
                }`}
              >
                {typeof item.stockQuantity === "number"
                  ? item.stockQuantity
                  : "—"}
              </Text>
            </View>

            <View className="w-[17.86%] flex-row items-center justify-center">
              <Text
                className={`text-xl ${
                  isLowStock ? "text-red-400" : "text-gray-300"
                }`}
              >
                {typeof item.reorderThreshold === "number"
                  ? `${item.reorderThreshold}`
                  : ""}
              </Text>
            </View>

            <View className="w-[17.86%] items-center justify-center">
              <Text
                className={`text-lg px-2 py-0.5 rounded ${
                  item.availability !== false
                    ? "bg-green-600 text-green-50"
                    : "bg-red-600 text-red-50"
                }`}
              >
                {item.availability !== false ? "On" : "Off"}
              </Text>
            </View>
          </TouchableOpacity>
        </Link>

        {/* 3. Actions (Outside Link) */}
        <View className="w-[10%] items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="p-3">
                <MoreHorizontal color={colors.label} size={24} />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-panel border-border">
              <DropdownMenuItem
                onPress={() => onToggleAvailability(item)}
                className="flex-row items-center p-2"
              >
                <>
                  {item.availability !== false ? (
                    <EyeOff color={colors.label} size={14} />
                  ) : (
                    <Eye color={colors.label} size={14} />
                  )}
                </>
                <Text className="text-white ml-1.5 text-sm">
                  {item.availability !== false ? "Make Off" : "Make On"}
                </Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onPress={() => onOpenStockModal(item)}
                className="flex-row items-center p-2"
              >
                <Edit color={colors.label} size={14} />
                <Text className="text-white ml-1.5 text-sm">Update Stock</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </View>
    );
  },
  // Performance Optimization: Only re-render if data actually changed
  (prev, next) => {
    return (
      prev.initialIsSelected === next.initialIsSelected &&
      prev.item.id === next.item.id &&
      prev.item.stockQuantity === next.item.stockQuantity &&
      prev.item.availability === next.item.availability
    );
  }
);

export default MenuCatalogRow;
