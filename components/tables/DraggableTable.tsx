import { TableType } from "@/lib/types";
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
  onPress: () => void;
}

const STATUS_COLORS = {
  Available: "#10B981", // Green
  "In Use": "#3B82F6", // Blue
  "Needs Cleaning": "#EF4444", // Red
};
const CHAIR_COLOR = "#D1D5DB"; // Gray for chairs

const DraggableTable: React.FC<DraggableTableProps> = ({
  table,
  position,
  onDragEnd,
  isEditMode,
  canvasScale,
  onPress, // 2. Receive the onPress handler
}) => {
  // --- All gesture and animation logic is unchanged ---
  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

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
    position: "absolute",
    top: 0,
    left: 0,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const TableComponent = table.component;

  const Content = () => (
    <Animated.View style={animatedStyle}>
      <TableComponent
        color={STATUS_COLORS[table.status]}
        chairColor={CHAIR_COLOR}
      />
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-white font-bold text-lg">{table.name}</Text>
      </View>
    </Animated.View>
  );

  return (
    <GestureDetector gesture={gesture}>
      {/* 3. The logic is now much simpler */}
      {isEditMode ? (
        // If editing, the content is just a view (not pressable)
        <Content />
      ) : (
        // If not editing, the content is a pressable button
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          <Content />
        </TouchableOpacity>
      )}
    </GestureDetector>
  );
};

export default DraggableTable;
