import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import { RotateCcw, Trash2 } from "lucide-react-native";
import React, { useEffect } from "react";
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

const STATUS_COLORS: Record<TableType["status"], string> = {
  Available: "#10B981", // Green
  "In Use": "#3B82F6", // Blue
  "Needs Cleaning": "#EF4444", // Red,
  "Not in Service": "#6B7280", // Gray
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
  const { updateTablePosition, updateTableRotation, removeTable } =
    useFloorPlanStore();
  const { orders } = useOrderStore();

  const router = useRouter();

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

  const activeOrderForThisTable = orders.find(
    (o) => o.service_location_id === table.id && o.order_status !== "Voided"
  );

  const orderTotal =
    activeOrderForThisTable?.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    ) || 0;

  const TableComponent = table.component;

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          onPress={isEditMode ? onSelect : onPress}
          activeOpacity={0.8}
        >
          <TableComponent
            color={
              table.type === "table" ? STATUS_COLORS[table.status] : "#E5E7EB"
            }
            chairColor={
              table.type === "table" ? STATUS_COLORS[table.status] : "#E5E7EB"
            }
          />
          <View className="absolute inset-0 items-center justify-center">
            <Text className="text-white font-bold text-lg">{table.name}</Text>
            {table.type === "table" && (
              <Text className="text-white font-bold text-lg">
                ${orderTotal.toFixed(2)}
              </Text>
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
