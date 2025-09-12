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
  isEditMode,
  isSelected,
  onSelect,
  canvasScale,
  onPress,
}) => {
  // Get the actions directly from the store
  const { updateTablePosition, updateTableRotation, removeTable } =
    useFloorPlanStore();
  const { orders } = useOrderStore();

  const router = useRouter();

  // --- Animation and Gesture state
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
      runOnJS(updateTablePosition)(table.id, {
        x: translateX.value,
        y: translateY.value,
      });
    });

  const rotateGesture = Gesture.Pan()
    .enabled(isEditMode)
    .onStart(() => {
      // Store the starting rotation when the drag begins
      rotateContext.value = rotation.value;
    })
    .onUpdate((event) => {
      // Calculate the angle from the center of the component to the touch point
      // Note: The (50, 40) values are half the component's rough size. A more robust
      // solution would be to measure the component with onLayout.
      const angle = Math.atan2(event.translationY, event.translationX);
      const angleInDegrees = angle * (180 / Math.PI);
      rotation.value = rotateContext.value + angleInDegrees;
    })
    .onEnd(() => {
      // Snap to the nearest 45-degree angle for clean layouts
      const snappedRotation = Math.round(rotation.value / 45) * 45;
      rotation.value = withSpring(snappedRotation);
      runOnJS(updateTableRotation)(table.id, snappedRotation);
    });

  const handleDelete = () => {
    // Call the store action directly
    removeTable(table.id);
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
      // Show border if selected in edit mode, OR if it's a merged table
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
    (o) =>
      o.service_location_id === table.id &&
      o.order_status !== "Voided" &&
      o.order_status !== "Closed" // Show all orders except voided ones
  );

  // Calculate the total for this specific order's cart
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
          <View className="absolute -top-12 left-1/2 flex-row bg-white p-1.5 rounded-full z-50">
            <GestureDetector gesture={rotateGesture}>
              <View className="p-2 bg-gray-100 rounded-full cursor-grab">
                <RotateCcw color="black" size={18} />
              </View>
            </GestureDetector>
            <TouchableOpacity
              onPress={handleDelete}
              className="p-2 ml-1 bg-black/10 rounded-full"
            >
              <Trash2 color="red" size={18} />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

export default DraggableTable;
