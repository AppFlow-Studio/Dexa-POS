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
    const [isSelected, setIsSelected] = useState(initialIsSelected);

    React.useEffect(() => {
      setIsSelected(initialIsSelected);
    }, [initialIsSelected]);

    const handlePress = useCallback(() => {
      setIsSelected((prev) => !prev);
      onToggle(item.id);
    }, [item.id, onToggle]);

    const isLowStock =
      typeof item.stockQuantity === "number" &&
      typeof item.reorderThreshold === "number" &&
      item.stockQuantity <= item.reorderThreshold;

    const isAvailable = item.availability !== false;

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Checkbox */}
        <View style={{ width: "6%" }}>
          <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.7}
            style={{
              height: 20,
              width: 20,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderRadius: 4,
              backgroundColor: isSelected ? colors.teal : "transparent",
              borderColor: isSelected ? colors.teal : colors.border,
            }}
          >
            {isSelected && <Check color={colors.onSolid} size={12} />}
          </TouchableOpacity>
        </View>

        {/* Content */}
        <Link href={`/inventory/menu-items/${item.id}`} asChild>
          <TouchableOpacity style={{ flexDirection: "row", width: "84%", alignItems: "center" }}>
            <View style={{ width: "28.57%", paddingRight: 8 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}
              >
                {item.name}
              </Text>
            </View>

            <Text style={{ fontSize: 13, color: colors.label, width: "17.86%" }}>
              ${item.price.toFixed(2)}
            </Text>

            <View style={{ width: "17.86%", alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: isLowStock ? colors.danger : colors.heading }}>
                {typeof item.stockQuantity === "number" ? item.stockQuantity : "—"}
              </Text>
            </View>

            <View style={{ width: "17.86%", alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: isLowStock ? colors.danger : colors.label }}>
                {typeof item.reorderThreshold === "number" ? `${item.reorderThreshold}` : ""}
              </Text>
            </View>

            <View style={{ width: "17.86%", alignItems: "center" }}>
              <View
                style={{
                  backgroundColor: isAvailable ? colors.success + "20" : colors.danger + "20",
                  borderWidth: 1,
                  borderColor: isAvailable ? colors.success + "50" : colors.danger + "50",
                  borderRadius: 20,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: isAvailable ? colors.success : colors.danger,
                  }}
                >
                  {isAvailable ? "On" : "Off"}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Link>

        {/* Actions */}
        <View style={{ width: "10%", alignItems: "flex-end" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity style={{ padding: 6 }}>
                <MoreHorizontal size={16} color={colors.muted} />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-44"
              style={{ backgroundColor: colors.panel, borderColor: colors.border }}
            >
              <DropdownMenuItem
                onPress={() => onToggleAvailability(item)}
                className="flex-row items-center p-2"
              >
                {isAvailable ? (
                  <EyeOff color={colors.label} size={14} />
                ) : (
                  <Eye color={colors.label} size={14} />
                )}
                <Text style={{ fontSize: 13, color: colors.heading, marginLeft: 8 }}>
                  {isAvailable ? "Make Off" : "Make On"}
                </Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onPress={() => onOpenStockModal(item)}
                className="flex-row items-center p-2"
              >
                <Edit color={colors.label} size={14} />
                <Text style={{ fontSize: 13, color: colors.heading, marginLeft: 8 }}>
                  Update Stock
                </Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </View>
    );
  },
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
