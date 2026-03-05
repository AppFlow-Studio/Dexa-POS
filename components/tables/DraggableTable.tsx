import { TABLE_SHAPES } from "@/lib/table-shapes";
import {
  registerTablePosition,
  unregisterTablePosition,
} from "@/lib/tablePositionRegistry";
import { colors, TABLE_STATUS_COLORS } from "@/lib/theme";
import { useTableTimerTick } from "@/hooks/useTableTimerTick";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { BrushCleaning, RotateCcw, Sparkles, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface DraggableTableProps {
  table: FloorPlanObject;
  layoutId: string; // Kept for prop compatibility, though unused
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  canvasScale: SharedValue<number>;
  onPress?: () => void;
  index?: number; // For staggered entry animation
}

const DraggableTable: React.FC<DraggableTableProps> = ({
  table,
  layoutId,
  isEditMode,
  isSelected,
  onSelect,
  canvasScale,
  onPress,
  index = 0,
}) => {
  const tablesById = useFloorPlanStore((s) => s.tablesById);
  const updateTablePosition = useFloorPlanStore((s) => s.updateTablePosition);
  const removeTable = useFloorPlanStore((s) => s.removeTable);
  const saveSnapshot = useFloorPlanStore((s) => s.saveSnapshot);
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const tick = useTableTimerTick();

  // --- COMPONENT LOOKUP ---
  const shapeDef =
    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES] ||
    TABLE_SHAPES["square-4"];
  const TableComponent = shapeDef?.component;

  const getOrder = useOrderStore((s) => s.getOrder);

  const effectiveOrder = useMemo(() => {
    // Fast path: O(1) session-based lookup via getOrder (checks ordersById + dbOrderIdIndex)
    if (table.session?.order_id) {
      const found = getOrder(table.session.order_id);
      if (found) return found;
    }

    // Fallback: non-reactive scan by service_location_id
    // Uses getState() to avoid subscribing to full ordersById
    const allOrders = useOrderStore.getState().ordersById;
    return Object.values(allOrders).find(
      (o) => o.service_location_id === table.id && o.order_status !== "void",
    );
  }, [table.session?.order_id, getOrder, table.id]);

  const { duration, isOvertime } = useMemo(() => {
    // Determine if table is effectively "in use" based on session or order
    const status = table.session?.status?.toLowerCase();
    const isInUse =
      status === "seating" ||
      status === "seated" ||
      status === "ordering" ||
      status === "ordered" ||
      status === "served" ||
      status === "check_presented" ||
      status === "paying" ||
      status === "paid" ||
      status === "closing" ||
      effectiveOrder;

    if (!isInUse || !effectiveOrder?.opened_at) {
      return { duration: "", isOvertime: false };
    }

    const startTime = new Date(effectiveOrder.opened_at).getTime();
    const diffMins = Math.floor((Date.now() - startTime) / 60000);

    return {
      duration: `${diffMins} min`,
      isOvertime: defaultSittingTimeMinutes > 0 && diffMins > defaultSittingTimeMinutes,
    };
  }, [
    tick,
    table.session,
    effectiveOrder,
    defaultSittingTimeMinutes,
  ]);

  const displayName = useMemo(() => {
    if (
      table.session &&
      table.session.merged_tables &&
      table.session.merged_tables.length > 0
    ) {
      const otherTableNames = table.session.merged_tables
        .filter((id) => id !== table.id)
        .map((id) => tablesById[id]?.name)
        .filter(Boolean)
        .join(", ");

      if (otherTableNames) {
        return `${table.name} (Merged: ${otherTableNames})`;
      }
    }
    return table.name;
  }, [table, tablesById]);

  // --- ANIMATED VALUES ---
  const translateX = useSharedValue(table.x);
  const translateY = useSharedValue(table.y);
  const rotation = useSharedValue(table.rotation);
  const dragContext = useSharedValue({ x: 0, y: 0 });
  const rotateContext = useSharedValue(0);

  // Entry animation shared values
  const entryScale = useSharedValue(0.8);
  const entryOpacity = useSharedValue(0);

  // Pulse animation for realtime updates
  const pulseScale = useSharedValue(1);

  // Staggered entry animation on mount
  useEffect(() => {
    const delay = index * 30; // 30ms stagger per table
    const timeout = setTimeout(() => {
      entryScale.value = withSpring(1, { damping: 15, stiffness: 200 });
      entryOpacity.value = withTiming(1, { duration: 200 });
    }, delay);
    return () => clearTimeout(timeout);
  }, [index]);

  // Pulse animation when session status changes
  useEffect(() => {
    // Skip initial render
    if (entryOpacity.value === 0) return;

    pulseScale.value = withSequence(
      withTiming(1.05, { duration: 100 }),
      withSpring(1, { damping: 10 }),
    );
  }, [table.session?.status, table.session?.order_id]);

  // --- SYNC WITH UNDO/REDO ---
  useAnimatedReaction(
    () => ({ x: table.x, y: table.y, r: table.rotation }),
    (current, prev) => {
      if (
        !prev ||
        current.x !== prev.x ||
        current.y !== prev.y ||
        current.r !== prev.r
      ) {
        translateX.value = current.x;
        translateY.value = current.y;
        rotation.value = current.r || 0;
      }
    },
    [table.x, table.y, table.rotation],
  );

  useEffect(() => {
    registerTablePosition(table.id, translateX, translateY);
    return () => unregisterTablePosition(table.id);
  }, [table.id]);

  const dragGesture = Gesture.Pan()
    .enabled(isEditMode)
    .onStart(() => {
      runOnJS(saveSnapshot)();
      dragContext.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate((event) => {
      translateX.value =
        dragContext.value.x + event.translationX / canvasScale.value;
      translateY.value =
        dragContext.value.y + event.translationY / canvasScale.value;
    })
    .onEnd(() => {
      runOnJS(updateTablePosition)(
        table.id,
        translateX.value,
        translateY.value,
        rotation.value,
      );
    });

  const rotateGesture = Gesture.Pan()
    .enabled(isEditMode)
    .onStart(() => {
      runOnJS(saveSnapshot)();
      rotateContext.value = rotation.value;
    })
    .onUpdate((event) => {
      const angle = Math.atan2(event.translationY, event.translationX);
      const angleInDegrees = angle * (180 / Math.PI);
      rotation.value = rotateContext.value + angleInDegrees;
    })
    .onEnd(() => {
      const snappedRotation = Math.round(rotation.value / 45) * 45;
      rotation.value = snappedRotation;
      runOnJS(updateTablePosition)(
        table.id,
        translateX.value,
        translateY.value,
        snappedRotation,
      );
    });

  const handleDelete = () => {
    removeTable(table.id);
  };

  const animatedStyle = useAnimatedStyle(() => {
    const isMerged =
      table.session &&
      table.session.merged_tables &&
      table.session.merged_tables.length > 0;
    return {
      position: "absolute",
      top: 0,
      left: 0,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation.value}deg` },
        { scale: entryScale.value * pulseScale.value },
      ],
      opacity: entryOpacity.value,
      borderWidth: 2,
      borderColor: isSelected
        ? colors.info
        : isMerged
          ? colors.warning
          : "transparent",
      borderRadius: 18,
      padding: 4,
    };
  });

  const orderTotal =
    effectiveOrder?.items?.reduce(
      (acc: number, item: any) => acc + item.price * item.quantity,
      0,
    ) || 0;

  const tableStatus = table.session?.status || "available"; // Fallback
  const tableColor = isOvertime
    ? TABLE_STATUS_COLORS.Overtime
    : TABLE_STATUS_COLORS[tableStatus];

  // Type check for category is effective if we trust the object
  const isTableType = table.category === "table" || table.category === "booth";

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          onPress={isEditMode ? onSelect : onPress}
          activeOpacity={0.8}
        >
          {TableComponent ? (
            <TableComponent
              color={isTableType ? tableColor : colors.label}
              chairColor={isTableType ? tableColor : colors.label}
            />
          ) : (
            <View
              style={{
                width: 100,
                height: 100,
                backgroundColor: isTableType ? tableColor : colors.label,
                borderRadius: 16,
              }}
            />
          )}
          <View className="absolute inset-0 items-center justify-center px-1">
            <Text
              className={`text-base text-center font-bold ${
                isTableType ? "text-white" : "text-hint"
              }`}
              numberOfLines={1}
            >
              {displayName ? displayName : table.name}
            </Text>

            {isTableType && tableStatus === "available" && (
              <Text className="text-white font-semibold text-[9px]">
                {table.capacity ||
                  TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
                    ?.capacity ||
                  0}{" "}
                SEATS
              </Text>
            )}

            {isTableType &&
              (tableStatus === "seating" ||
                tableStatus === "seated" ||
                tableStatus === "ordering" ||
                tableStatus === "ordered" ||
                tableStatus === "served" ||
                tableStatus === "check_presented" ||
                tableStatus === "paying" ||
                tableStatus === "paid") && (
                <>
                  {!effectiveOrder && table.session ? (
                    <Text className="text-white/60 font-semibold text-sm">
                      Loading...
                    </Text>
                  ) : (
                    <>
                      <Text className="text-white font-bold text-base">
                        ${orderTotal.toFixed(2)}
                      </Text>
                      <Text className="text-white font-semibold text-base">
                        {duration}
                      </Text>
                    </>
                  )}
                </>
              )}

            {isTableType &&
              (tableStatus === "cleaning" || tableStatus === "closing") && (
                <BrushCleaning size={16} color="rgba(255,255,255,0.6)" />
              )}
          </View>
        </TouchableOpacity>

        {isSelected && isEditMode && (
          <View className="absolute -top-16 left-1/2 flex-row bg-white p-2 rounded-full z-50">
            <GestureDetector gesture={rotateGesture}>
              <View className="p-2 bg-gray-100 rounded-full cursor-grab">
                <RotateCcw color="black" size={24} />
              </View>
            </GestureDetector>
            <TouchableOpacity
              onPress={handleDelete}
              className="p-2 ml-1 bg-black/10 rounded-full"
            >
              <Trash2 color="red" size={24} />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

export default React.memo(DraggableTable);
