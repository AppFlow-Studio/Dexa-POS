import { TableType } from "@/lib/types";
import { Href, Link } from "expo-router";
import React, { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface DraggableTableProps {
  table: TableType;
  position: { x: number; y: number };
  onDragEnd: (tableId: string, position: { x: number; y: number }) => void;
  isEditMode: boolean;
}

const DraggableTable: React.FC<DraggableTableProps> = ({
  table,
  position,
  onDragEnd,
  isEditMode,
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
      // 3. When the drag starts, store the current position in our context variables.
      // This freezes the starting point for the duration of the gesture.
      contextX.value = translateX.value;
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      // 4. Update the position based on the CONTEXT, not the stale `position` prop.
      translateX.value = contextX.value + event.translationX;
      translateY.value = contextY.value + event.translationY;
    })
    .onEnd(() => {
      // 5. Use runOnJS to safely call the React state setter from the UI thread.
      // This prevents potential race conditions.
      runOnJS(onDragEnd)(table.id, {
        x: translateX.value,
        y: translateY.value,
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
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

  // TODO: Make table sizes dynamic based on capacity or a specific prop
  // For now, using fixed sizes for demonstration
  const shapeClass = table.shape === "circle" ? "rounded-full" : "rounded-2xl";
  const sizeClass = table.shape === "circle" ? "w-24 h-24" : "w-32 h-20";

  const Content = () => (
    <Animated.View
      style={animatedStyle}
      className={`absolute top-0 left-0 border items-center justify-center ${sizeClass} ${shapeClass} ${statusClasses[table.status]}`}
    >
      {table.status === "Needs Cleaning" && (
        <View
          style={{
            backgroundColor: "rgba(128, 128, 128, 0.2)",
          }}
          className="absolute inset-0"
        />
      )}
      <Text className={`text-2xl font-bold ${statusTextClasses[table.status]}`}>
        {table.id}
      </Text>
      <View className="absolute -top-2 -right-2 bg-gray-700 rounded-full w-6 h-6 items-center justify-center flex-row">
        {/* <Users color="#FFFFFF" size={12} /> */}
        <Text className="text-white text-xs font-bold ml-0.5">
          {table.capacity}
        </Text>
      </View>
    </Animated.View>
  );

  return (
    <GestureDetector gesture={gesture}>
      {isEditMode ? (
        // If in edit mode, render without a link
        <Content />
      ) : (
        // If NOT in edit mode, wrap the content in a Link
        <Link href={`/tables/${table.id}` as Href} asChild>
          <TouchableOpacity activeOpacity={0.7}>
            <Content />
          </TouchableOpacity>
        </Link>
      )}
    </GestureDetector>
  );
};

export default DraggableTable;
