import { useDragToAddContext } from "@/contexts/DragToAddContext";
import { SHAPE_OPTIONS, TABLE_SHAPES } from "@/lib/table-shapes";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme } from "@/lib/theme";
import { DraggableShape } from "./DraggableShape";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";

interface AddTableBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet>;
  onClose: () => void;
}

const TABS = [
  { id: "table", label: "Tables" },
  { id: "booth", label: "Booths" },
  { id: "structure", label: "Structure" },
  { id: "decor", label: "Decor" },
  { id: "functional", label: "Functional" },
  { id: "zone", label: "Zones" },
];

export const AddTableBottomSheet: React.FC<AddTableBottomSheetProps> = ({
  bottomSheetRef,
  onClose,
}) => {
  const snapPoints = useMemo(() => ["35%", "60%"], []);
  const { isDraggingNewObject } = useDragToAddContext();
  const [activeTab, setActiveTab] = useState("table");

  const filteredShapes = useMemo(
    () => SHAPE_OPTIONS.filter((shape) => shape.category === activeTab),
    [activeTab]
  );

  // Close the bottom sheet when a drag starts
  useAnimatedReaction(
    () => isDraggingNewObject.value,
    (isDragging, wasDragging) => {
      if (isDragging && !wasDragging) {
        runOnJS(bottomSheetRef.current?.close)();
      }
    },
    [isDraggingNewObject]
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      {...bottomSheetTheme}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      <BottomSheetView className="flex-1 bg-panel">
        <View className="px-4 pt-2 pb-2 border-b border-gray-700">
          <Text className="text-white text-xl font-bold">Add to Floor Plan</Text>
          <Text className="text-gray-400 text-sm mt-1">
            Select a category, then drag an object onto the canvas.
          </Text>
        </View>

        {/* Tab Bar */}
        <View className="flex-row w-full border-b border-gray-700 bg-transparent px-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                className={`py-3 px-4 items-center border-b-2 ${
                  activeTab === tab.id
                    ? "border-blue-400"
                    : "border-transparent"
                }`}
              >
                <Text
                  className={`font-semibold ${
                    activeTab === tab.id
                      ? "text-blue-400"
                      : "text-gray-400"
                  }`}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content Grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="flex-1 p-4"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View className="flex-row flex-wrap justify-start -mx-2">
            {filteredShapes.map(({ id, label, component: ShapeComponent }) => (
              <View key={id} className="w-1/2 px-2 mb-4">
                <DraggableShape
                  shapeId={id as keyof typeof TABLE_SHAPES}
                >
                  <View className="p-3 rounded-xl items-center justify-center h-[110px] bg-surface">
                    <View className="flex-1 items-center justify-center">
                      <ShapeComponent color={colors.label} height={50} />
                    </View>
                    <Text
                      className="mt-2 h-5 font-semibold text-xs text-center text-gray-300"
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </View>
                </DraggableShape>
              </View>
            ))}
          </View>
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
};
