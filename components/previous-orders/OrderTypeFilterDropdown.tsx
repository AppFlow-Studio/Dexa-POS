import { colors } from "@/lib/theme";
import { OrderType } from "@/lib/types";
import { Check, Filter } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface OrderTypeFilterDropdownProps {
  selected: OrderType[];
  onChange: (selected: OrderType[]) => void;
}

const ORDER_TYPE_OPTIONS: OrderType[] = [
  "Dine In",
  "Takeaway",
  "Delivery",
];

export default function OrderTypeFilterDropdown({
  selected,
  onChange,
}: OrderTypeFilterDropdownProps) {
  const toggleOrderType = (type: OrderType) => {
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TouchableOpacity className="flex-row items-center gap-2 px-4 py-2 bg-panel rounded-lg">
          <Filter size={18} color={colors.label} />
          <Text className="text-white text-base">
            {`Type${selected.length > 0 ? ` (${selected.length})` : ""}`}
          </Text>
        </TouchableOpacity>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 bg-screen border border-border">
        {ORDER_TYPE_OPTIONS.map((type) => (
          <DropdownMenuItem
            key={type}
            onPress={() => toggleOrderType(type)}
            className="flex-row items-center justify-between py-3 px-4"
          >
            <Text className="text-white text-base">{type}</Text>
            {selected.includes(type) && (
              <Check size={18} color={colors.success} />
            )}
          </DropdownMenuItem>
        ))}
        {selected.length > 0 && (
          <>
            <View className="h-px bg-card my-1" />
            <DropdownMenuItem
              onPress={clearAll}
              className="py-3 px-4"
            >
              <Text className="text-red-400 text-base">Clear All</Text>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
