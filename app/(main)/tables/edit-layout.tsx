import AddTableModal from "@/components/tables/AddTableModal";
import DraggableTable from "@/components/tables/DraggableTable";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Link as LinkIcon, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler"; // Import Gesture Handler
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated"; // Import Animated components
import Svg, { Line } from "react-native-svg";
import AddTableButton from "./AddTableButton";

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
  } = useFloorPlanStore();
  const { consolidateOrdersForTables } = useOrderStore();
  const [isAddModalOpen, setAddModalOpen] = useState(false);

  const activeLayout = layouts.find((l) => l.id === layoutId);
  const tables = activeLayout?.tables || [];

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
  // --- END GESTURE HANDLING ---

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

  const handleAddTable = (data: { name: string; shapeId: any }) => {
    if (layoutId) {
      addTable(layoutId, data);
    }
  };

  const selectedTable = tables.find((t) => t.id === selectedTableIds[0]);
  const canUnmerge =
    selectedTableIds.length === 1 &&
    (selectedTable?.isPrimary || selectedTable?.mergedWith?.length);

  if (!activeLayout) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center">
        <Text className="text-xl text-white">
          Loading Layout or Layout Not Found...
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 p-3 bg-blue-600 rounded-lg"
        >
          <Text className="text-white text-base">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="bg-[#303030] p-4 flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-white">
          {activeLayout.name}
        </Text>
        <View className="flex-row gap-3">
          {selectedTableIds.length >= 2 && (
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
                canvasScale={scale}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
      <AddTableButton onPress={() => setAddModalOpen(true)} />

      <AddTableModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddTable}
      />
    </View>
  );
};

export default LayoutEditorScreen;
