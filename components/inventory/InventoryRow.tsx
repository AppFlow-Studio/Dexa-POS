import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import {
  Eye,
  EyeOff,
  MoreHorizontal,
  Package,
  Pen,
  Trash2,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface InventoryRowProps {
  item: MenuItemType;
  // Add handlers for actions
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const statusClasses: Record<string, string> = {
  Active: "bg-green-100 text-green-800",
  Draft: "bg-yellow-100 text-yellow-800",
  Inactive: "bg-gray-200 text-gray-600",
  "Out of Stock": "bg-red-100 text-red-800",
};

const InventoryRow: React.FC<InventoryRowProps> = ({
  item,
  onToggleActive,
  onEdit,
  onDelete,
}) => {
  // Use useMemo to avoid re-creating the image source on every render
  const imageSource = useMemo(() => {
    // Assuming item.image is a string URL or a local require path
    return item.image
      ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
      : undefined;
  }, [item.image]);

  const isActive = item.status === "Active";

  return (
    <View className="flex-row items-center p-4 border-b border-gray-100">
      {/* Column widths must match the header widths */}
      <Text className="w-[5%] font-semibold text-gray-600">
        {item.serialNo}
      </Text>
      {/* <Text className="w-[10%] font-semibold text-gray-600">{item.id}</Text> */}
      <View className="w-[20%] flex-row items-center">
        {item.image ? (
          <Image
            source={imageSource}
            className="w-10 h-10 rounded-lg bg-gray-100"
          />
        ) : (
          <View className="w-10 h-10 rounded-lg bg-gray-100 items-center justify-center">
            <Package color="#9ca3af" size={20} />
          </View>
        )}
        <Text className="ml-3 font-bold text-gray-800">{item.name}</Text>
      </View>
      <Text className="w-[20%] text-gray-600" numberOfLines={2}>
        {item.description}
      </Text>
      <Text className="w-[8%] font-semibold text-gray-800">{item.stock}</Text>
      <Text className="w-[8%] font-semibold text-gray-600">{item.unit}</Text>
      <Text className="w-[12%] font-semibold text-gray-600">
        {item.lastUpdate}
      </Text>
      <View className="w-[12%]">
        <View
          className={`px-3 py-1 rounded-full self-start ${statusClasses[item.status]}`}
        >
          <Text className={`font-bold text-xs ${statusClasses[item.status]}`}>
            {item.status}
          </Text>
        </View>
      </View>
      <View className="w-[10%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2 rounded-md hover:bg-gray-100">
              <MoreHorizontal color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onPress={onToggleActive}>
              {isActive ? (
                <EyeOff className="mr-2 h-4 w-4" color="#4b5563" />
              ) : (
                <Eye className="mr-2 h-4 w-4" color="#4b5563" />
              )}
              <Text>{isActive ? "Deactivate" : "Activate"}</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={onEdit}>
              <Pen className="mr-2 h-4 w-4" color="#4b5563" />
              <Text>Edit</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={onDelete}>
              <Trash2 className="mr-2 h-4 w-4 text-red-500" color="#ef4444" />
              <Text className="text-red-500">Delete</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </View>
  );
};

export default InventoryRow;
