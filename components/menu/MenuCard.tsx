import { colors } from "@/lib/theme";
import { Menu } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useMenuStore } from "@/stores/useMenuStore";
import { Eye, EyeOff, GripVertical, Pencil } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface DraggableMenuProps {
  menu: Menu & { isAvailableNow: boolean; categories: any[] };
  onToggleActive: (menuId: string) => void;
  onEdit: () => void;
}

export const DraggableMenu: React.FC<DraggableMenuProps> = ({
  menu,
  onToggleActive,
  onEdit,
}) => {
  const toggleMenuCategoryActive = useMenuStore((store) => store.toggleMenuCategoryActive);
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  return (
    <View className="bg-surface rounded-lg border border-gray-700 p-4 mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <GripVertical size={s(20)} color={colors.label} />
          <Text className="text-xl font-semibold text-white">{menu.name}</Text>
          <View
            className={`px-2.5 py-1 rounded-full ${
              menu.isActive && menu.isAvailableNow
                ? "bg-green-900/30 border border-green-500"
                : "bg-red-900/30 border border-red-500"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                menu.isActive && menu.isAvailableNow
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {menu.isActive
                ? menu.isAvailableNow
                  ? "Available Now"
                  : "Unavailable Now"
                : "Inactive"}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => onToggleActive(menu.id)}
            className="p-2 bg-panel rounded border border-gray-600"
          >
            {menu.isActive ? (
              <Eye size={s(20)} color={colors.success} />
            ) : (
              <EyeOff size={s(20)} color={colors.danger} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onEdit}
            className="p-2 bg-panel rounded border border-gray-600"
          >
            <Pencil size={s(16)} color={colors.label} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
