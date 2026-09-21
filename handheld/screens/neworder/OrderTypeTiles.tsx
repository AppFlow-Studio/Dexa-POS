import { colors } from "@/lib/theme";
import { ShoppingBag, Truck, Utensils, type LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { type } from "../../lib/type";

export type TileType = "dine_in" | "takeout" | "delivery";

const TILES: { value: TileType; label: string; icon: LucideIcon }[] = [
  { value: "dine_in", label: "Dine in", icon: Utensils },
  { value: "takeout", label: "Takeout", icon: ShoppingBag },
  { value: "delivery", label: "Delivery", icon: Truck },
];

/** The artifact's `.types`: three 104dp tiles, icon over label, the pick solid. */
export function OrderTypeTiles({ value, onChange }: { value: TileType; onChange: (next: TileType) => void }) {
  return (
    <View className="flex-row gap-2.5 px-4">
      {TILES.map(({ value: v, label, icon: Icon }) => {
        const on = v === value;
        const fg = on ? colors.onSolid : colors.label;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            className="flex-1 items-center justify-center gap-2.5 rounded-3xl"
            style={{ minHeight: 104, backgroundColor: on ? colors.teal : colors.panel }}
          >
            <Icon size={26} color={fg} />
            <Text style={[type.segment, { color: fg }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
