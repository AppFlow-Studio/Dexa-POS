import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { Minus, Plus } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import DraggableTable from "./DraggableTable";

interface TableLayoutViewProps {
  tables: TableType[];
  layoutId: string;
  isEditMode?: boolean;
  showConnections?: boolean;
  className?: string;
  isSelectionMode?: boolean;
  onTableSelect?: (table: TableType) => void;
}

const TableLayoutView: React.FC<TableLayoutViewProps> = ({
  tables,
  layoutId,
  isEditMode = false,
  showConnections = true,
  className = "",
  isSelectionMode = false,
  onTableSelect,
}) => {
  const { selectedTableIds, toggleTableSelection } = useFloorPlanStore();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const combinedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View className={`flex-1 relative overflow-hidden ${className}`}>
      <View className="absolute top-2 left-2 flex flex-col z-20 gap-y-2">
        <TouchableOpacity
          onPress={() => {
            scale.value += 0.1;
            savedScale.value = scale.value;
          }}
          className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start`}
        >
          <Plus color="#9CA3AF" size={24} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            scale.value -= 0.1;
            savedScale.value = scale.value;
          }}
          className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start `}
        >
          <Minus color="#9CA3AF" size={24} />
        </TouchableOpacity>
      </View>
      <GestureDetector gesture={combinedGesture}>
        <Animated.View style={canvasAnimatedStyle} className="w-full h-full">
          {showConnections && (
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {tables.map((table) => {
                if (table.isPrimary && table.mergedWith) {
                  const primaryCenter = { x: table.x + 50, y: table.y + 50 };
                  return table.mergedWith.map((mergedId) => {
                    const mergedTable = tables.find((t) => t.id === mergedId);
                    if (!mergedTable) return null;
                    const mergedCenter = {
                      x: mergedTable.x + 50,
                      y: mergedTable.y + 50,
                    };
                    return (
                      <Line
                        key={`${table.id}-${mergedId}`}
                        x1={primaryCenter.x}
                        y1={primaryCenter.y}
                        x2={mergedCenter.x}
                        y2={mergedCenter.y}
                        stroke="#F59E0B"
                        strokeWidth="4"
                        strokeDasharray="8, 4"
                      />
                    );
                  });
                }
                return null;
              })}
            </Svg>
          )}
          {tables.map((table) => (
            <DraggableTable
              key={table.id}
              table={table}
              layoutId={layoutId}
              isEditMode={isEditMode}
              isSelected={selectedTableIds.includes(table.id)}
              onSelect={
                isSelectionMode
                  ? () => onTableSelect && onTableSelect(table)
                  : () => toggleTableSelection(table.id)
              }
              onPress={
                isSelectionMode
                  ? () => onTableSelect && onTableSelect(table)
                  : () => toggleTableSelection(table.id)
              }
              canvasScale={scale}
            />
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

export default TableLayoutView;
