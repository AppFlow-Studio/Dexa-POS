// /components/tables/TableLayoutView.tsx

import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { Minus, Plus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
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
  selectedTableId?: string; // Added to handle selection state from parent
  activeOrderId?: string | null;
}

const TableLayoutView: React.FC<TableLayoutViewProps> = ({
  tables,
  layoutId,
  isEditMode = false,
  showConnections = true,
  className = "",
  isSelectionMode = false,
  onTableSelect,
  selectedTableId, // Consuming the new prop
  activeOrderId,
}) => {
  const { toggleTableSelection, selectedTableIds: globallySelectedTableIds } =
    useFloorPlanStore();

  // Use the correct selection state based on mode
  const selectedTableIds = isSelectionMode
    ? selectedTableId
      ? [selectedTableId]
      : []
    : globallySelectedTableIds;

  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });
  const [contentDims, setContentDims] = useState({ width: 0, height: 0 });

  const [isLoading, setIsLoading] = useState(true);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  // 1. Calculate the bounding box of the tables
  useEffect(() => {
    setIsLoading(true);
    if (tables.length > 0) {
      let maxX = 0;
      let maxY = 0;
      tables.forEach((table) => {
        // Approximate width/height of a table for bounding box calculation
        const tableWidth = 100;
        const tableHeight = 100;
        if (table.x + tableWidth > maxX) {
          maxX = table.x + tableWidth;
        }
        if (table.y + tableHeight > maxY) {
          maxY = table.y + tableHeight;
        }
      });
      setContentDims({ width: maxX, height: maxY });
    } else {
      setContentDims({ width: 0, height: 0 });
      setIsLoading(false); // No tables, no need to load
    }
  }, [tables]);

  // 2. Calculate and set initial scale and position once we have dimensions
  useEffect(() => {
    if (containerDims.width > 0 && contentDims.width > 0) {
      const scaleX = containerDims.width / contentDims.width;
      const scaleY = containerDims.height / contentDims.height;
      const initialScale = Math.min(scaleX, scaleY);

      const initialTranslateX =
        ((containerDims.width - contentDims.width) * initialScale) / 2;
      const initialTranslateY =
        ((containerDims.height - contentDims.height) * initialScale) / 2;

      scale.value = initialScale;
      savedScale.value = initialScale;
      translateX.value = initialTranslateX;
      savedTranslateX.value = initialTranslateX;
      translateY.value = initialTranslateY;
      savedTranslateY.value = initialTranslateY;

      setIsLoading(false);
      opacity.value = withTiming(1);
    } else if (containerDims.width > 0) {
      // Handle case with no tables
      setIsLoading(false);
      opacity.value = withTiming(1);
    }
  }, [containerDims, contentDims]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerDims({ width, height });
  };

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
    // 3. Add onLayout prop to the container
    <View
      onLayout={onLayout}
      className={`flex-1 relative overflow-hidden ${className}`}
    >
      {isLoading && (
        <View
          style={StyleSheet.absoluteFill}
          className="items-center justify-center bg-[#212121] z-30"
        >
          <ActivityIndicator size="large" color="#60A5FA" />
        </View>
      )}
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
