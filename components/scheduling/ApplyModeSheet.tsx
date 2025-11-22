import { ApplyMode } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { CheckCircle2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const APPLY_MODES: {
  value: ApplyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "merge",
    label: "Merge",
    description: "Keep existing shifts, add new shifts from the template.",
  },
  {
    value: "replace-all",
    label: "Replace All",
    description:
      "Deletes all existing shifts in the week and replaces them with the template's shifts.",
  },
  {
    value: "fill-gaps",
    label: "Fill Gaps",
    description:
      "Only add shifts from the template into empty, unscheduled slots.",
  },
];

interface ApplyModeSheetProps {
  sheetRef: React.RefObject<BottomSheet>;
  currentMode: ApplyMode;
  onSelectMode: (mode: ApplyMode) => void;
  onClose: () => void;
}

const ApplyModeSheet: React.FC<ApplyModeSheetProps> = ({
  sheetRef,
  currentMode,
  onSelectMode,
  onClose,
}) => {
  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["40%"]}
      enablePanDownToClose
      onClose={onClose}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backgroundStyle={{ backgroundColor: "#1F1F1F" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      <BottomSheetView className="p-6">
        <Text className="text-white text-xl font-bold mb-6">
          Select Apply Mode
        </Text>
        <View className="gap-y-4">
          {APPLY_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.value}
              onPress={() => onSelectMode(mode.value)}
              className={`p-4 rounded-lg border-2 ${
                currentMode === mode.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-700 bg-[#303030]"
              }`}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-semibold text-base">
                  {mode.label}
                </Text>
                {currentMode === mode.value && (
                  <CheckCircle2 size={20} color="#3b82f6" />
                )}
              </View>
              <Text className="text-gray-400 text-sm mt-1">
                {mode.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
};

export default ApplyModeSheet;
