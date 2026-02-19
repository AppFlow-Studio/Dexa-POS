import { CartItem } from "@/lib/types";
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
  isModifierSidebarOpen: boolean;
  onMarkAllReady: (itemIds: string[]) => void;
  isCourseSent: boolean;
}

const ItemProgressTracker: React.FC<ItemProgressTrackerProps> = ({
  selectedCourse,
  itemsInSelectedCourse,
  isModifierSidebarOpen,
  onMarkAllReady,
  isCourseSent,
}) => {
  // Logic derived from props
  const allItemsReady = itemsInSelectedCourse.every(
    (item) => item.item_status === "ready" || item.item_status === "served"
  );
  const anyItemsPreparing = itemsInSelectedCourse.some(
    (item) => item.item_status === "preparing"
  );
  const allItemsServed = itemsInSelectedCourse.every(
    (item) => item.item_status === "served"
  );

  const handleMarkAllReady = () => {
    const preparingItemIds = itemsInSelectedCourse
      .filter((item) => item.item_status === "preparing")
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
          icon: <CheckCircle2 size={12} color="#10b981" />,
        };
      case "ready":
        return {
          bg: "bg-green-900/20",
          border: "border-green-500/50",
          text: "text-green-400",
          icon: <CheckCircle2 size={12} color="#4ade80" />,
        };
      case "preparing":
        return {
          bg: "bg-yellow-900/20",
          border: "border-yellow-500/50",
          text: "text-yellow-400",
          icon: <Clock size={12} color="#facc15" />,
        };
      default: // Not Sent
        return {
          bg: "bg-gray-800",
          border: "border-gray-600",
          text: "text-gray-400",
          icon: <UtensilsCrossed size={12} color="#9ca3af" />,
        };
    }
  };

  return (
    <View
      className="flex-row items-center bg-[#1E1E1E] border-t border-[#333] px-3 py-3 shadow-lg"
      style={{ height: 72 }} // Fixed compact height
    >
      {/* SECTION 1: Course Label (Fixed Left) */}
      <View className="mr-3 items-center justify-center border-r border-[#333] pr-3 h-full">
        <Text className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
          Course
        </Text>
        <Text className="text-2xl font-black text-white leading-tight">
          {selectedCourse}
        </Text>
      </View>

      {/* SECTION 2: Scrollable Items List */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-1 mr-3"
        contentContainerStyle={{ alignItems: "center", paddingRight: 10 }}
      >
        {itemsInSelectedCourse.length > 0 ? (
          itemsInSelectedCourse.map((item) => {
            const style = getItemStyle(item.item_status);
            return (
              <View
                key={item.id}
                className={`flex-row items-center ${style.bg} ${style.border} border rounded-full px-3 py-1.5 mr-2`}
              >
                <View className="mr-1.5">{style.icon}</View>
                <Text className="text-gray-200 font-medium text-sm mr-1">
                  {item.name}
                </Text>
                <View className="bg-white/10 rounded px-1.5 ml-1">
                  <Text className={`text-xs font-bold ${style.text}`}>
                    x{item.quantity}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text className="text-gray-500 italic text-sm">
            No items in course
          </Text>
        )}
      </ScrollView>

      {/* SECTION 3: Action Buttons (Fixed Right) */}
      <View className="flex-row gap-2">
        {/* Ready Button — show when items are preparing but not all ready/served */}
        {!allItemsReady && anyItemsPreparing && (
          <TouchableOpacity
            onPress={handleMarkAllReady}
            disabled={isModifierSidebarOpen}
            className={`flex-row items-center bg-green-600 px-4 py-2.5 rounded-lg active:opacity-80 ${isModifierSidebarOpen ? "opacity-50 bg-gray-400" : ""}`}
          >
            <CheckCheck size={18} color="white" strokeWidth={3} />
            <Text className="ml-2 font-bold text-white text-sm">Ready</Text>
          </TouchableOpacity>
        )}

        {/* Served badge — all items served */}
        {isCourseSent && allItemsServed && (
          <View className="px-2 py-2 rounded-lg border border-emerald-700 bg-emerald-900/30">
            <Text className="text-emerald-500 text-xs font-medium">Served</Text>
          </View>
        )}

        {/* Ready badge — all ready (or served) but not all served */}
        {isCourseSent && allItemsReady && !allItemsServed && (
          <View className="px-2 py-2 rounded-lg border border-green-700 bg-green-900/30">
            <Text className="text-green-400 text-xs font-medium">Ready</Text>
          </View>
        )}

        {/* Sent indicator — course sent but items haven't started preparing yet */}
        {isCourseSent && !anyItemsPreparing && !allItemsReady && (
          <View className="px-2 py-2 rounded-lg border border-amber-700 bg-amber-900/30">
            <Text className="text-amber-400 text-xs font-medium">Sent</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default ItemProgressTracker;
