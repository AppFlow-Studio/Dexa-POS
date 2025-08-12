import { TableType } from "@/lib/types";
import { Href, Link } from "expo-router";
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
  position: { x: number; y: number };
  onDragEnd: (tableId: string, position: { x: number; y: number }) => void;
  isEditMode: boolean;
  canvasScale: SharedValue<number>;
}

const STATUS_COLORS = {
  Available: "#10B981", // Green
  "In Use": "#3B82F6", // Blue
  "Needs Cleaning": "#EF4444", // Red
};

const DraggableTable: React.FC<DraggableTableProps> = ({
  table,
  position,
  onDragEnd,
  isEditMode,
  canvasScale,
}) => {
  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);

  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

  // Sync with parent state
  useEffect(() => {
    translateX.value = withSpring(position.x);
    translateY.value = withSpring(position.y);
  }, [position]);

  const gesture = Gesture.Pan()
    .enabled(isEditMode)
    .onStart(() => {
      contextX.value = translateX.value;
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      // 4. Adjust the translation by the current canvas scale
      translateX.value =
        contextX.value + event.translationX / canvasScale.value;
      translateY.value =
        contextY.value + event.translationY / canvasScale.value;
    })
    .onEnd(() => {
      runOnJS(onDragEnd)(table.id, {
        x: translateX.value,
        y: translateY.value,
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute", // Crucial for SVG positioning
    top: 0,
    left: 0,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // Visual styles remain similar to FloorPlanTable
  const statusClasses: { [key: string]: string } = {
    Available: "bg-white border-gray-200",
    "In Use": "bg-red-500 border-red-600",
    "Needs Cleaning": "bg-gray-200 border-gray-300",
  };
  const statusTextClasses: { [key: string]: string } = {
    Available: "text-gray-800",
    "In Use": "text-white",
    "Needs Cleaning": "text-gray-600",
  };

  // Destructure the SVG component from the table data
  const TableComponent = table.component;

  const Content = () => (
    <Animated.View style={animatedStyle}>
      <TableComponent color={STATUS_COLORS[table.status]} />
      {/* Position the text label in the center of the SVG */}
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-white font-bold text-lg">{table.name}</Text>
      </View>
    </Animated.View>
  );

  return (
    <GestureDetector gesture={gesture}>
      {isEditMode ? (
        <Content />
      ) : (
        <Link
          href={
            table.status === "Needs Cleaning"
              ? `/tables/clean-table/${table.id}`
              : (`/tables/${table.id}` as Href)
          }
          asChild
        >
          <TouchableOpacity activeOpacity={0.7}>
            <Content />
          </TouchableOpacity>
        </Link>
      )}
    </GestureDetector>
  );
};

export default DraggableTable;
