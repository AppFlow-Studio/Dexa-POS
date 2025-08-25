import AddTableModal from "@/components/tables/AddTableModal";
import DraggableTable from "@/components/tables/DraggableTable";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

const LayoutEditorScreen = () => {
  const router = useRouter();
  const { tables, updateTablePosition, updateTableRotation, addTable } =
    useFloorPlanStore(); // Add new actions to store
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .enabled(true) // Always enabled for the canvas in edit mode
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

  // Combine gestures
  const combinedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Create the animated style for the canvas container
  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Create a memoized, re-ordered array for rendering.
  const tablesToRender = useMemo(() => {
    if (!selectedTableId) {
      // If nothing is selected, return the original order.
      return tables;
    }

    // Find the selected table
    const selectedTable = tables.find((t) => t.id === selectedTableId);
    if (!selectedTable) {
      return tables;
    }

    // Return a new array with all other tables first, and the selected table last.
    return [...tables.filter((t) => t.id !== selectedTableId), selectedTable];
  }, [tables, selectedTableId]); // This will re-run only when the tables list or the selection changes

  const handleAddTable = (tableData: any) => {
    console.log("Adding table", tableData.name);

    addTable(tableData);
    setAddModalOpen(false);
  };

  return (
    <View className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="bg-white p-4 flex-row justify-between items-center">
        <Text className="text-2xl font-bold"></Text>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => setAddModalOpen(true)}
            className="py-3 px-5 rounded-lg flex-row items-center bg-primary-400 text-white"
          >
            <Plus size={16} color="white" />
            <Text className="font-bold text-white">Add Table</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            className="py-3 px-5 rounded-lg flex-row items-center bg-green-600"
          >
            <Text className="font-bold text-white">Save & Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas */}
      <View className="flex-1 relative overflow-hidden">
        <GestureDetector gesture={combinedGesture}>
          <Animated.View style={canvasAnimatedStyle} className="w-full h-full">
            <Pressable
              onPress={() => setSelectedTableId(null)}
              className="absolute inset-0"
            />

            {tablesToRender.map((table) => (
              <DraggableTable
                key={table.id}
                table={table}
                isEditMode={true} // Always edit mode here
                isSelected={selectedTableId === table.id}
                onSelect={() => setSelectedTableId(table.id)}
                canvasScale={scale}
              />
            ))}
          </Animated.View>
        </GestureDetector>
      </View>

      <AddTableModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddTable}
      />
    </View>
  );
};

export default LayoutEditorScreen;
