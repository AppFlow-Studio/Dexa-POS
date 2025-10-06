import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { RotateCcw, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface DraggableTableProps {
  table: TableType;
  layoutId: string; // Added to know which layout this table belongs to
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  canvasScale: SharedValue<number>;
  onPress?: () => void;
}

const STATUS_COLORS: Record<TableType["status"] | "Overtime", string> = {
  Available: "#10B981", // Green
  "In Use": "#3B82F6", // Blue
  "Needs Cleaning": "#EF4444", // Red
  "Not in Service": "#6B7280", // Gray
  Overtime: "#F59E0B", // Yellow-Orange
};

const DraggableTable: React.FC<DraggableTableProps> = ({
  table,
  layoutId, // Now receiving the layoutId
  isEditMode,
  isSelected,
  onSelect,
  canvasScale,
  onPress,
}) => {
  const { layouts, updateTablePosition, updateTableRotation, removeTable } =
    useFloorPlanStore();
  const { orders } = useOrderStore();
  const { defaultSittingTimeMinutes } = useSettingsStore();

  const [duration, setDuration] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);

  const activeOrderForThisTable = orders.find(
    (o) => o.service_location_id === table.id && o.order_status !== "Voided"
  );

  const orderForThisGroup = useMemo(() => {
    // If the table is part of a merge, find the primary table's order.
    if (table.mergedWith) {
      const allTables = layouts.flatMap((l) => l.tables);
      const primaryTable = table.isPrimary
        ? table
        : allTables.find(
            (t) => t.isPrimary && t.mergedWith?.includes(table.id)
          );

      if (primaryTable) {
        return orders.find(
          (o) =>
            o.service_location_id === primaryTable.id &&
            o.order_status !== "Voided" &&
            o.order_status !== "Closed"
        );
      }
    }
    // Otherwise, find the order for this specific table.
    return orders.find(
      (o) =>
        o.service_location_id === table.id &&
        o.order_status !== "Voided" &&
        o.order_status !== "Closed"
    );
  }, [table, orders, layouts]);

  useEffect(() => {
    if (table.status !== "In Use" || !orderForThisGroup?.opened_at) {
      setDuration("");
      setIsOvertime(false);
      return;
    }

    const timer = setInterval(() => {
      const startTime = new Date(orderForThisGroup.opened_at!);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      setDuration(`${diffMins} min`);
      setIsOvertime(diffMins > defaultSittingTimeMinutes);
    }, 1000); // Update every second for a smoother timer

    // Run once immediately
    const startTime = new Date(orderForThisGroup.opened_at);
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    setDuration(`${diffMins} min`);
    setIsOvertime(diffMins > defaultSittingTimeMinutes);

    return () => clearInterval(timer);
  }, [table.status, orderForThisGroup, defaultSittingTimeMinutes]);

  // Timer Logic now uses the correct order for the entire group
  useEffect(() => {
    if (table.status !== "In Use" || !orderForThisGroup?.opened_at) {
      setDuration("");
      setIsOvertime(false);
      return;
    }

    const timer = setInterval(() => {
      const startTime = new Date(orderForThisGroup.opened_at!);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      setDuration(`${diffMins} min`);
      setIsOvertime(diffMins > defaultSittingTimeMinutes);
    }, 1000); // Update every second for a smoother timer

    // Run once immediately
    const startTime = new Date(orderForThisGroup.opened_at);
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    setDuration(`${diffMins} min`);
    setIsOvertime(diffMins > defaultSittingTimeMinutes);

    return () => clearInterval(timer);
  }, [table.status, orderForThisGroup, defaultSittingTimeMinutes]);

  const displayName = useMemo(() => {
    const allTables = layouts.flatMap((l) => l.tables);

    // Case 1: It's a primary table
    if (table.isPrimary && table.mergedWith && table.mergedWith.length > 0) {
      const mergedNames = table.mergedWith
        .map((id) => allTables.find((t) => t.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      return `${table.name} (Merged: ${mergedNames})`;
    }

    // Case 2: It's a non-primary merged table
    if (table.mergedWith && !table.isPrimary) {
      const primaryTable = allTables.find(
        (t) => t.isPrimary && t.mergedWith?.includes(table.id)
      );
      if (primaryTable) {
        return `${table.name} (Merged: ${primaryTable.name})`;
      }
    }

    // Case 3: It's a standalone table
    return table.name;
  }, [table, layouts]);

  const translateX = useSharedValue(table.x);
  const translateY = useSharedValue(table.y);
  const rotation = useSharedValue(table.rotation);
  const dragContext = useSharedValue({ x: 0, y: 0 });
  const rotateContext = useSharedValue(0);

  useEffect(() => {
    translateX.value = withSpring(table.x);
    translateY.value = withSpring(table.y);
    rotation.value = withSpring(table.rotation);
  }, [table]);

  const dragGesture = Gesture.Pan()
    .enabled(isEditMode)
    .onStart(() => {
      dragContext.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate((event) => {
      translateX.value =
        dragContext.value.x + event.translationX / canvasScale.value;
      translateY.value =
        dragContext.value.y + event.translationY / canvasScale.value;
    })
    .onEnd(() => {
      // FIX: Pass layoutId as the first argument
      runOnJS(updateTablePosition)(layoutId, table.id, {
        x: translateX.value,
        y: translateY.value,
      });
    });

  const rotateGesture = Gesture.Pan()
    .enabled(isEditMode)
    .onStart(() => {
      rotateContext.value = rotation.value;
    })
    .onUpdate((event) => {
      const angle = Math.atan2(event.translationY, event.translationX);
      const angleInDegrees = angle * (180 / Math.PI);
      rotation.value = rotateContext.value + angleInDegrees;
    })
    .onEnd(() => {
      const snappedRotation = Math.round(rotation.value / 45) * 45;
      rotation.value = withSpring(snappedRotation);
      // FIX: Pass layoutId as the first argument
      runOnJS(updateTableRotation)(layoutId, table.id, snappedRotation);
    });

  const handleDelete = () => {
    // FIX: Pass layoutId as the first argument
    removeTable(layoutId, table.id);
  };

  const animatedStyle = useAnimatedStyle(() => {
    const isMerged = table.mergedWith && table.mergedWith.length > 0;
    return {
      position: "absolute",
      top: 0,
      left: 0,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation.value}deg` },
      ],
      borderWidth: 2,
      borderColor:
        isSelected && isEditMode
          ? "#3B82F6"
          : isMerged
          ? "#F59E0B"
          : "transparent",
      borderRadius: 18,
      padding: 4,
    };
  });

  const orderTotal =
    orderForThisGroup?.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    ) || 0;

  const TableComponent = table.component;

  const tableColor = isOvertime
    ? STATUS_COLORS.Overtime
    : STATUS_COLORS[table.status];

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          onPress={isEditMode ? onSelect : onPress}
          activeOpacity={0.8}
        >
          <TableComponent
            color={table.type === "table" ? tableColor : "#E5E7EB"}
            chairColor={table.type === "table" ? tableColor : "#E5E7EB"}
          />
          <View className="absolute inset-0 items-center justify-center px-1">
            <Text
              className={`text-base text-center font-bold ${
                table.type === "table" ? "text-white" : "text-[#757575]"
              }`}
              numberOfLines={1}
            >
              {displayName}
            </Text>

            {table.type === "table" && table.status === "In Use" && (
              <>
                <Text className="text-white font-bold text-base">
                  ${orderTotal.toFixed(2)}
                </Text>
                <Text className="text-white font-semibold text-base">
                  {duration}
                </Text>
              </>
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

export default DraggableTable;
