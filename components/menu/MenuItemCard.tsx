import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { colors } from "@/lib/theme";
import { MenuItemType } from "@/lib/types";
import { Edit2, Eye, EyeOff, Trash2, Utensils } from "lucide-react-native";
import React from "react";
import {
  Image,
  ImageSourcePropType,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const getImageSource = (
  image: string | undefined
): ImageSourcePropType | undefined => {
  if (image && image.length > 200) {
    return { uri: `data:image/jpeg;base64,${image}` };
  }
  if (image && MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP]) {
    return MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP];
  }
  return undefined;
};

interface MenuItemCardProps {
  item: MenuItemType;
  onEdit: (item: MenuItemType) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (id: string) => void;
  onPriceEdit?: (item: MenuItemType) => void;
  editDisabled?: boolean;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  onEdit,
  onDelete,
  onToggleAvailability,
  onPriceEdit: _onPriceEdit,
  editDisabled = false,
}) => {
  const imageSource = getImageSource(item.image);
  const isAvailable = item.availability !== false;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
      }}
    >
      {/* Thumbnail */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
          marginRight: 10,
        }}
      >
        {imageSource ? (
          <Image source={imageSource} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.panel,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Utensils color={colors.muted} size={16} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={{ fontSize: 12, color: colors.label }}>
          ${item.price.toFixed(2)}
        </Text>
        <View
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 20,
            backgroundColor: isAvailable ? colors.success + "20" : colors.danger + "15",
            borderWidth: 1,
            borderColor: isAvailable ? colors.success + "50" : colors.danger + "30",
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "600", color: isAvailable ? colors.success : colors.danger }}>
            {isAvailable ? "Available" : "Unavailable"}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity
          onPress={() => onToggleAvailability(item.id)}
          disabled={editDisabled}
          style={{ padding: 6, opacity: editDisabled ? 0.4 : 1 }}
        >
          {isAvailable ? (
            <Eye size={14} color={colors.success} />
          ) : (
            <EyeOff size={14} color={colors.danger} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onEdit(item)}
          disabled={editDisabled}
          style={{ padding: 6, opacity: editDisabled ? 0.4 : 1 }}
        >
          <Edit2 size={14} color={colors.label} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDelete(item.id)}
          disabled={editDisabled}
          style={{ padding: 6, opacity: editDisabled ? 0.4 : 1 }}
        >
          <Trash2 size={14} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
};
