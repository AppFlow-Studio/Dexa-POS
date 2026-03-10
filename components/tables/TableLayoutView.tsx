// /components/tables/TableLayoutView.tsx

import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { colors } from "@/lib/theme";
import { Minus, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import DraggableTable from "./DraggableTable";
import TableLayoutSkeleton from "./TableLayoutSkeleton";

interface TableLayoutViewProps {
  tables: FloorPlanObject[];
  layoutId: string;
  isEditMode?: boolean;
  showConnections?: boolean;
  className?: string;
  isSelectionMode?: boolean;
  onTableSelect?: (table: FloorPlanObject) => void;
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
  const toggleTableSelection = useFloorPlanStore((s) => s.toggleTableSelection);
  const globallySelectedTableIds = useFloorPlanStore((s) => s.selectedTableIds);

  // Create O(1) lookup map for tables
  const tablesById = useMemo(() => {
    return tables.reduce((acc, table) => {
      acc[table.id] = table;
      return acc;
    }, {} as Record<string, FloorPlanObject>);
  }, [tables]);

  // Use the correct selection state:
  // - In selection mode: use global store (supports multi-select for merge)
  // - Otherwise: use global store or fall back to single selectedTableId prop
  const selectedTableIds = selectedTableId
    ? [selectedTableId]
    : globallySelectedTableIds;

  // O(1) lookup Set for isSelected checks
  const selectedTableIdsSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds],
  );

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

  const skeletonOpacity = useSharedValue(1);
  const contentOpacity = useSharedValue(0);

  // Position-only fingerprint: only recalc bounding box when tables move, not on session changes
  const positionFingerprint = useMemo(
    () => tables.map((t) => `${t.id}:${t.x}:${t.y}:${t.width}:${t.height}`).join("|"),
    [tables],
  );

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!initialLoadDone.current) {
      setIsLoading(true);
      initialLoadDone.current = true;
    }
    if (tables.length > 0) {
      let maxX = 0;
      let maxY = 0;
      tables.forEach((table) => {
        const tableWidth = table.width || 100;
        const tableHeight = table.height || 100;
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
      setIsLoading(false);
    }
  }, [positionFingerprint]);

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
      // Crossfade: fade out skeleton, fade in content
      skeletonOpacity.value = withTiming(0, { duration: 200 });
      contentOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    } else if (containerDims.width > 0) {
      // Handle case with no tables
      setIsLoading(false);
      opacity.value = withTiming(1);
      skeletonOpacity.value = withTiming(0, { duration: 200 });
      contentOpacity.value = withTiming(1, { duration: 300 });
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

  // Crossfade animated styles
  const skeletonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: skeletonOpacity.value > 0 ? 30 : -1,
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    flex: 1,
  }));

  return (
    // 3. Add onLayout prop to the container
    <View
      onLayout={onLayout}
      className={`flex-1 relative overflow-hidden ${className}`}
    >
      {/* Skeleton Crossfade Layer */}
      <Animated.View style={skeletonAnimatedStyle}>
        <TableLayoutSkeleton tableCount={8} showControls={false} />
      </Animated.View>

      {/* Main Content with Crossfade */}
      <Animated.View style={contentAnimatedStyle}>
        <View className="absolute top-2 left-2 flex flex-col z-20 gap-y-2">
        <TouchableOpacity
          onPress={() => {
            scale.value += 0.1;
            savedScale.value = scale.value;
          }}
          className={`flex-row items-center bg-surface border border-gray-600 rounded-lg px-4 py-3 justify-start`}
        >
          <Plus color={colors.label} size={24} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            scale.value -= 0.1;
            savedScale.value = scale.value;
          }}
          className={`flex-row items-center bg-surface border border-gray-600 rounded-lg px-4 py-3 justify-start `}
        >
          <Minus color={colors.label} size={24} />
        </TouchableOpacity>
      </View>
      <GestureDetector gesture={combinedGesture}>
        <Animated.View style={canvasAnimatedStyle} className="w-full h-full">
          {showConnections && (
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {tables.map((table) => {
                const mergedTableIds = table.session?.merged_tables;
                if (mergedTableIds && mergedTableIds.length > 0) {
                  const primaryCenter = { x: table.x + 50, y: table.y + 50 };
                  return mergedTableIds.map((mergedId) => {
                    // Only draw if this table ID is "less than" the other ID to avoid double drawing
                    if (table.id >= mergedId) return null;

                    const mergedTable = tablesById[mergedId];
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
          {tables.map((table, index) => (
            <TableItem
              key={table.id}
              table={table}
              layoutId={layoutId}
              isEditMode={isEditMode}
              isSelected={selectedTableIdsSet.has(table.id)}
              isSelectionMode={isSelectionMode}
              onTableSelect={onTableSelect}
              toggleTableSelection={toggleTableSelection}
              canvasScale={scale}
              index={index}
            />
          ))}
        </Animated.View>
      </GestureDetector>
      </Animated.View>
    </View>
  );
};

const TableItem = React.memo(
  ({
    table,
    layoutId,
    isEditMode,
    isSelected,
    isSelectionMode,
    onTableSelect,
    toggleTableSelection,
    canvasScale,
    index,
  }: {
    table: FloorPlanObject;
    layoutId: string;
    isEditMode: boolean;
    isSelected: boolean;
    isSelectionMode: boolean;
    onTableSelect?: (table: FloorPlanObject) => void;
    toggleTableSelection: (id: string) => void;
    canvasScale: any;
    index: number;
  }) => {
    const handleSelect = useCallback(() => {
      if (isSelectionMode) {
        onTableSelect?.(table);
      } else {
        toggleTableSelection(table.id);
      }
    }, [isSelectionMode, onTableSelect, toggleTableSelection, table]);

    return (
      <DraggableTable
        table={table}
        layoutId={layoutId}
        isEditMode={isEditMode}
        isSelected={isSelected}
        onSelect={handleSelect}
        onPress={handleSelect}
        canvasScale={canvasScale}
        index={index}
      />
    );
  },
);

export default React.memo(TableLayoutView, (prev, next) => {
  if (prev.layoutId !== next.layoutId) return false;
  if (prev.isEditMode !== next.isEditMode) return false;
  if (prev.isSelectionMode !== next.isSelectionMode) return false;
  if (prev.showConnections !== next.showConnections) return false;
  if (prev.selectedTableId !== next.selectedTableId) return false;
  if (prev.activeOrderId !== next.activeOrderId) return false;
  if (prev.onTableSelect !== next.onTableSelect) return false;
  const pt = prev.tables,
    nt = next.tables;
  if (pt.length !== nt.length) return false;
  for (let i = 0; i < pt.length; i++) {
    if (
      pt[i].id !== nt[i].id ||
      pt[i].session?.status !== nt[i].session?.status ||
      pt[i].session?.order_id !== nt[i].session?.order_id ||
      pt[i].name !== nt[i].name
    )
      return false;
  }
  return true;
});
