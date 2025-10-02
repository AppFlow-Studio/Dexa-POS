import { AddTableModal } from "@/components/tables/AddTableModal";
import DraggableTable from "@/components/tables/DraggableTable";
import QuickSetupPanel from "@/components/tables/QuickSetupPanel"; // Import the QuickSetupPanel
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Link as LinkIcon,
  Maximize,
  Minus,
  Plus,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Line, Path, Pattern, Rect } from "react-native-svg";
import AddTableButton from "./AddTableButton";
// Assuming AddTableButton is in the same directory, adjust if needed
// import AddTableButton from "./AddTableButton";

// --- GridPattern Component (as defined before) ---
const GridPattern = () => (
  <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
    <Defs>
      <Pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <Path
          d="M 40 0 L 0 0 0 40"
          fill="none"
          stroke="#4a4a4a"
          strokeWidth="0.5"
        />
      </Pattern>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#grid)" />
  </Svg>
);

const LayoutEditorScreen = () => {
  const router = useRouter();
  const { layoutId } = useLocalSearchParams<{ layoutId: string }>();
  const {
    layouts,
    selectedTableIds,
    toggleTableSelection,
    mergeTables,
    unmergeTables,
    clearSelection,
    addTable,
    addMultipleTables, // Ensure this action is available from your store
  } = useFloorPlanStore();
  const { consolidateOrdersForTables } = useOrderStore();
  const [isAddModalOpen, setAddModalOpen] = useState(false);

  const activeLayout = useMemo(
    () => layouts.find((l) => l.id === layoutId),
    [layouts, layoutId]
  );
  const tables = activeLayout?.tables || [];

  // --- ADDED STATE for QuickSetupPanel ---
  const [isQuickSetupOpen, setQuickSetupOpen] = useState(tables.length === 0);

  // --- GESTURE HANDLING LOGIC ---
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
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

  const handleZoom = (direction: "in" | "out") => {
    const newScale = direction === "in" ? scale.value * 1.2 : scale.value / 1.2;
    scale.value = withTiming(newScale);
    savedScale.value = newScale;
  };

  const recenterCanvas = () => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  useEffect(() => {
    clearSelection();
    return () => clearSelection();
  }, [layoutId]);

  const handleMerge = () => {
    const selectedTableNames = selectedTableIds
      .map((id) => tables.find((t) => t.id === id)?.name || "")
      .filter(Boolean);
    const newOrderId = consolidateOrdersForTables(
      selectedTableIds,
      selectedTableNames
    );
    mergeTables(selectedTableIds, newOrderId);
  };

  const handleUnmerge = () => {
    if (selectedTableIds.length === 1) {
      unmergeTables(selectedTableIds[0]);
    }
  };

  // --- ADDED HANDLERS for Modals ---
  const handleAddSingleTable = (data: {
    name: string;
    shapeId: keyof typeof TABLE_SHAPES;
  }) => {
    if (layoutId) {
      addTable(layoutId, data);
      setAddModalOpen(false);
    }
  };

  const handleAddMultipleTables = (
    items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[]
  ) => {
    if (layoutId) {
      addMultipleTables(layoutId, items);
      setQuickSetupOpen(false); // Close the modal
    }
  };

  const selectedTable = tables.find((t) => t.id === selectedTableIds[0]);
  const canUnmerge =
    selectedTableIds.length === 1 &&
    (selectedTable?.isPrimary || selectedTable?.mergedWith?.length);
  const canMerge =
    selectedTableIds.length >= 2 &&
    !tables
      .filter((t) => selectedTableIds.includes(t.id))
      .some((t) => t.type === "static-object");

  if (!activeLayout) {
    return (
      <Text className="text-white text-center text-lg mt-10">
        Layout not found.
      </Text>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="bg-[#303030] p-4 flex-row justify-between items-center z-10">
        <Text className="text-2xl font-bold text-white">
          {activeLayout.name}
        </Text>
        <View className="flex-row gap-3">
          {canMerge && (
            <TouchableOpacity
              onPress={handleMerge}
              className="py-3 px-5 rounded-lg flex-row items-center bg-green-500"
            >
              <LinkIcon size={20} color="white" className="mr-2" />
              <Text className="text-lg font-bold text-white">Merge</Text>
            </TouchableOpacity>
          )}
          {canUnmerge && (
            <TouchableOpacity
              onPress={handleUnmerge}
              className="py-3 px-5 rounded-lg flex-row items-center bg-yellow-500"
            >
              <X size={20} color="white" className="mr-2" />
              <Text className="text-lg font-bold text-white">Unmerge</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.back()}
            className="py-3 px-5 rounded-lg flex-row items-center bg-gray-600"
          >
            <Text className="text-lg font-bold text-white">Save & Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <GestureDetector gesture={combinedGesture}>
        <View className="flex-1 relative overflow-hidden">
          <Animated.View style={canvasAnimatedStyle} className="w-full h-full">
            <GridPattern />
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
                        strokeWidth="3"
                        strokeDasharray="6, 3"
                      />
                    );
                  });
                }
                return null;
              })}
            </Svg>

            {tables.map((table) => (
              <DraggableTable
                key={table.id}
                table={table}
                layoutId={activeLayout.id}
                isEditMode={true}
                isSelected={selectedTableIds.includes(table.id)}
                onSelect={() => toggleTableSelection(table.id)}
                onPress={() => toggleTableSelection(table.id)}
                canvasScale={scale}
              />
            ))}
          </Animated.View>

          <View className="absolute top-4 left-4 flex-col gap-y-2 z-20">
            <TouchableOpacity
              onPress={() => handleZoom("in")}
              className="p-3 bg-[#303030] border border-gray-600 rounded-lg"
            >
              <Plus color="#9CA3AF" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleZoom("out")}
              className="p-3 bg-[#303030] border border-gray-600 rounded-lg"
            >
              <Minus color="#9CA3AF" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={recenterCanvas}
              className="p-3 bg-[#303030] border border-gray-600 rounded-lg"
            >
              <Maximize color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>
        </View>
      </GestureDetector>

      {/* --- ADDED QUICK SETUP PANEL and logic --- */}
      <QuickSetupPanel
        isOpen={isQuickSetupOpen}
        onClose={() => setQuickSetupOpen(false)}
        onAddMultiple={handleAddMultipleTables}
      />

      <AddTableButton onPress={() => setAddModalOpen(true)} />

      <AddTableModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddSingleTable}
      />
    </View>
  );
};

export default LayoutEditorScreen;
