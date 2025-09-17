import { TableType } from "@/lib/types";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface SelectableTableProps {
  table: TableType;
  isSelected: boolean;
  onSelect: (table: TableType) => void;
  canvasScale: SharedValue<number>;
  activeOrderId?: string | null;
}

const STATUS_COLORS: Record<TableType["status"], string> = {
  Available: "#10B981", // Green
  "In Use": "#3B82F6", // Blue
  "Needs Cleaning": "#EF4444", // Red,
  "Not in Service": "#6B7280", // Gray
};

const SelectableTable: React.FC<SelectableTableProps> = ({
  table,
  isSelected,
  onSelect,
  canvasScale,
  activeOrderId,
}) => {
  // Animation values
  const scale = useSharedValue(1);
  const translateX = useSharedValue(table.x);
  const translateY = useSharedValue(table.y);

  const handleTablePress = () => {
    // if (table.status !== "Available") {
    //     toast.error(`Table ${table.name} is not available`, {
    //         duration: 3000,
    //         position: ToastPosition.BOTTOM,
    //     });
    //     return;
    // }

    // Call the onSelect callback - let parent handle the assignment
    onSelect(table);
  };

  const tapGesture = Gesture.Tap()
    .onStart(() => {
      scale.value = withSpring(0.95);
    })
    .onEnd(() => {
      scale.value = withSpring(1);
      runOnJS(handleTablePress)();
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const getTableShape = () => {
    // Default to rounded-lg for all table types
    return "rounded-lg";
  };

  const getTableSize = () => {
    switch (table.capacity) {
      case 2:
        return "w-20 h-20";
      case 4:
        return "w-24 h-24";
      case 6:
        return "w-28 h-28";
      case 8:
        return "w-32 h-32";
      default:
        return "w-24 h-24";
    }
  };

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View
        style={[
          animatedStyle,
          {
            position: "absolute",
            left: 0,
            top: 0,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleTablePress}
          activeOpacity={0.8}
          className={`${getTableSize()} ${getTableShape()} items-center justify-center border-2 ${
            isSelected
              ? "border-blue-400 bg-blue-600"
              : `border-gray-300 bg-white`
          }`}
          style={{
            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: 2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}
        >
          {/* Table Status Indicator */}
          <View
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
            style={{
              backgroundColor: isSelected
                ? "#3B82F6"
                : STATUS_COLORS[table.status],
            }}
          />

          {/* Table Number */}
          <Text
            className={`font-bold text-xl ${isSelected ? "text-white" : "text-gray-800"}`}
          >
            {table.name}
          </Text>

          {/* Capacity */}
          <Text
            className={`text-lg text-center ${isSelected ? "text-blue-200" : "text-gray-500"}`}
          >
            Capacity: {table.capacity}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

export default SelectableTable;
