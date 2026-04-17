import { CartItem, OrderProfile } from "@/lib/types";
import { colors } from "@/lib/theme";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { iosOnly } from "@/lib/safeAnimations";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import BillItem from "./BillItem";

// --- Types ---
interface SeatAccordionProps {
  activeOrder: OrderProfile | undefined;
  itemSeatMap?: Record<string, number | null>;
  activeSeat?: number | null;
  seatCount: number;
  onSelectSeat?: (seat: number | null) => void;
}

interface SeatGroupProps {
  seatLabel: string;
  seatNumber: number | null;
  items: CartItem[];
  isExpanded: boolean;
  isCurrent: boolean;
  onToggle: (seat: number | null) => void;
}

// --- Sub-Component: SeatGroup ---
const SeatGroup: React.FC<SeatGroupProps> = React.memo(({
  seatLabel,
  seatNumber,
  items,
  isExpanded,
  isCurrent,
  onToggle,
}) => {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Animated.View layout={LinearTransition.duration(200)} className="mb-1">
      {/* Header */}
      <TouchableOpacity
        onPress={() => onToggle(seatNumber)}
        className="flex-row items-center justify-between py-3 px-2"
        activeOpacity={0.7}
      >
        <View className="flex-row items-center flex-1">
          <View
            className="w-2 h-2 rounded-full mr-2.5"
            style={{
              backgroundColor: isCurrent ? colors.teal : colors.muted,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            {seatLabel}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              marginLeft: 6,
            }}
          >
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </Text>
        </View>

        {isExpanded ? (
          <ChevronDown size={18} color={colors.label} />
        ) : (
          <ChevronRight size={18} color={colors.label} />
        )}
      </TouchableOpacity>

      {/* Content */}
      {isExpanded && (
        <Animated.View
          entering={iosOnly(FadeIn.duration(200))}
          exiting={iosOnly(FadeOut.duration(150))}
          layout={LinearTransition.duration(200)}
          className="pl-4 gap-y-2 overflow-hidden"
        >
          {items.map((item) => (
            <Animated.View
              key={item.id}
              layout={LinearTransition.duration(150)}
              className="overflow-hidden"
            >
              <BillItem item={item} isEditable={true} />
            </Animated.View>
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
});

// --- Main Component ---
const SeatAccordion: React.FC<SeatAccordionProps> = ({
  activeOrder,
  itemSeatMap,
  activeSeat,
  seatCount,
  onSelectSeat,
}) => {
  const [expandedSeat, setExpandedSeat] = useState<number | null | "shared">(
    null,
  );
  const prevItemCount = useRef<number>(0);

  // Group items by seat
  const groupedItems = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    activeOrder?.items?.forEach((item) => {
      const seat = item.seatNumber ?? itemSeatMap?.[item.id] ?? null;
      const key = seat === null ? "shared" : String(seat);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [activeOrder?.items, itemSeatMap]);

  // Sort seat keys: numbered seats first, then shared
  const sortedKeys = useMemo(() => {
    const keys = Object.keys(groupedItems);
    const numbered = keys
      .filter((k) => k !== "shared")
      .map(Number)
      .sort((a, b) => a - b);

    // Ensure all seats up to seatCount appear
    const allSeats = new Set(numbered);
    for (let i = 1; i <= seatCount; i++) {
      allSeats.add(i);
    }

    const result: (number | "shared")[] = Array.from(allSeats).sort(
      (a, b) => a - b,
    );
    // Shared at the end
    if (groupedItems["shared"]?.length > 0 || activeSeat === null) {
      result.push("shared");
    }
    return result;
  }, [groupedItems, seatCount, activeSeat]);

  // Auto-expand active seat when items are added
  useEffect(() => {
    const currentItemCount = activeOrder?.items?.length ?? 0;
    if (currentItemCount > prevItemCount.current) {
      setExpandedSeat(activeSeat === null || activeSeat === undefined ? "shared" : activeSeat);
    }
    prevItemCount.current = currentItemCount;
  }, [activeOrder?.items?.length, activeSeat]);

  const handleToggle = useCallback(
    (seat: number | null) => {
      const key = seat === null ? "shared" : seat;
      setExpandedSeat((prev) => (prev === key ? null : key));
      if (onSelectSeat) {
        onSelectSeat(seat);
      }
    },
    [onSelectSeat],
  );

  if (!activeOrder) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text style={{ fontSize: 12, color: colors.muted }}>
          No active order.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-panel p-4">
      {/* Header */}
      <View className="flex-row items-center justify-between pb-3 mb-2">
        <Text
          style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}
        >
          Order{" "}
          {activeOrder.display_number
            ? activeOrder.display_number.startsWith("#")
              ? activeOrder.display_number
              : `#${activeOrder.display_number}`
            : activeOrder.order_number
              ? `#${activeOrder.order_number}`
              : activeOrder.db_order_id
                ? `#${activeOrder.db_order_id.substring(0, 8)}`
                : ""}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View layout={LinearTransition.duration(250)}>
          {sortedKeys.length > 0 ? (
            sortedKeys.map((key) => {
              const seatNumber =
                key === "shared" ? null : (key as number);
              const label =
                key === "shared" ? "Shared" : `Seat ${key}`;
              const items =
                groupedItems[key === "shared" ? "shared" : String(key)] || [];
              const expandKey = key === "shared" ? "shared" : key;

              return (
                <SeatGroup
                  key={`seat-${key}`}
                  seatLabel={label}
                  seatNumber={seatNumber}
                  items={items}
                  isExpanded={expandedSeat === expandKey}
                  isCurrent={activeSeat === seatNumber}
                  onToggle={handleToggle}
                />
              );
            })
          ) : (
            <View className="flex-1 items-center justify-center mt-10">
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Add items to start an order.
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
};

export default SeatAccordion;
