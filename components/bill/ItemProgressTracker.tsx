import { getEffectiveItemStatus } from "@/lib/kitchenStatusUtils";
import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import {
  CheckCheck,
  CheckCircle2,
  Clock,
  UtensilsCrossed,
} from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  Layout,
} from "react-native-reanimated";

interface ItemProgressTrackerProps {
  selectedCourse: number;
  itemsInSelectedCourse: CartItem[];
  onMarkAllReady: (itemIds: string[]) => void;
  isCourseSent: boolean;
}

const ItemProgressTracker: React.FC<ItemProgressTrackerProps> = ({
  selectedCourse,
  itemsInSelectedCourse,
  onMarkAllReady,
  isCourseSent,
}) => {
  const isModifierSidebarOpen = useModifierSidebarStore(s => s.isOpen);
  // Logic derived from props
  const allItemsReady = itemsInSelectedCourse.every((item) => {
    const s = getEffectiveItemStatus(item);
    return s === "ready" || s === "served";
  });
  const anyItemsPreparing = itemsInSelectedCourse.some(
    (item) => getEffectiveItemStatus(item) === "preparing"
  );
  const allItemsServed = itemsInSelectedCourse.every(
    (item) => getEffectiveItemStatus(item) === "served"
  );

  const handleMarkAllReady = () => {
    const preparingItemIds = itemsInSelectedCourse
      .filter((item) => getEffectiveItemStatus(item) === "preparing")
      .map((item) => item.id);
    if (preparingItemIds.length > 0) {
      onMarkAllReady(preparingItemIds);
    }
  };

  // Helper to determine styling based on status
  const getItemStyle = (status: string | undefined) => {
    switch (status) {
      case "served":
        return {
          bg: "bg-emerald-900/30",
          border: "border-emerald-500/50",
          text: "text-emerald-500",
          icon: <CheckCircle2 size={12} color={colors.success} />,
        };
      case "ready":
        return {
          bg: "bg-green-900/20",
          border: "border-green-500/50",
          text: "text-green-400",
          icon: <CheckCircle2 size={12} color={colors.success} />,
        };
      case "preparing":
        return {
          bg: "bg-yellow-900/20",
          border: "border-yellow-500/50",
          text: "text-yellow-400",
          icon: <Clock size={12} color={colors.warning} />,
        };
      default: // Not Sent
        return {
          bg: "bg-gray-800",
          border: "border-gray-600",
          text: "text-gray-400",
          icon: <UtensilsCrossed size={12} color={colors.label} />,
        };
    }
  };

  return (
    <View
      className="flex-row items-center bg-panel border-t border-border px-3 py-2"
      style={{ height: 48 }}
    >
      {/* SECTION 1: Course Label (Fixed Left) */}
      <View className="mr-3 items-center justify-center border-r border-border pr-3 h-full">
        <Text className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">
          Course
        </Text>
        <Text className="text-lg font-black text-white leading-tight">
          {selectedCourse}
        </Text>
      </View>

      {/* SECTION 2: Scrollable Items List */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-1 mr-2"
        contentContainerStyle={{ alignItems: "center", paddingRight: 8 }}
      >
        {itemsInSelectedCourse.length > 0 ? (
          itemsInSelectedCourse.map((item) => {
            const style = getItemStyle(getEffectiveItemStatus(item));
            return (
              <View
                key={item.id}
                className="flex-row items-center mr-3"
              >
                <View className="mr-1">{style.icon}</View>
                <Text className="text-gray-300 font-medium text-xs" numberOfLines={1}>
                  {item.name}
                </Text>
                {item.quantity > 1 && (
                  <Text className={`text-xs font-bold ${style.text} ml-1`}>
                    x{item.quantity}
                  </Text>
                )}
              </View>
            );
          })
        ) : (
          <Text className="text-gray-500 italic text-xs">
            No items in course
          </Text>
        )}
      </ScrollView>

      {/* SECTION 3: Action Buttons (Fixed Right) */}
      <View className="flex-row gap-1.5">
        {/* Ready Button — show when items are preparing but not all ready/served */}
        {!allItemsReady && anyItemsPreparing && (
          <TouchableOpacity
            onPress={handleMarkAllReady}
            disabled={isModifierSidebarOpen}
            className={`flex-row items-center bg-green-600 px-3 py-1.5 rounded-lg active:opacity-80 ${isModifierSidebarOpen ? "opacity-50 bg-gray-400" : ""}`}
          >
            <CheckCheck size={14} color="white" strokeWidth={3} />
            <Text className="ml-1.5 font-bold text-white text-xs">Ready</Text>
          </TouchableOpacity>
        )}

        {/* Served badge — all items served */}
        {isCourseSent && allItemsServed && (
          <View className="px-2 py-1 rounded-md border border-emerald-700 bg-emerald-900/30">
            <Text className="text-emerald-500 text-[10px] font-medium">Served</Text>
          </View>
        )}

        {/* Ready badge — all ready (or served) but not all served */}
        {isCourseSent && allItemsReady && !allItemsServed && (
          <View className="px-2 py-1 rounded-md border border-green-700 bg-green-900/30">
            <Text className="text-green-400 text-[10px] font-medium">Ready</Text>
          </View>
        )}

        {/* Sent indicator — course sent but items haven't started preparing yet */}
        {isCourseSent && !anyItemsPreparing && !allItemsReady && (
          <View className="px-2 py-1 rounded-md border border-amber-700 bg-amber-900/30">
            <Text className="text-amber-400 text-[10px] font-medium">Sent</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default ItemProgressTracker;
