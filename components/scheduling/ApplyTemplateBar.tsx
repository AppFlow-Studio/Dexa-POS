import { Button } from "@/components/ui/button";
import { colors } from "@/lib/theme";
import { ApplyMode } from "@/lib/types";
import BottomSheet from "@/components/ui/bottomSheet";
import { AlertTriangle, CheckCircle, ChevronDown } from "lucide-react-native";
import React, { useRef } from "react";
import { Text, View } from "react-native";
import ApplyModeSheet from "./ApplyModeSheet"; // Import the new component

const APPLY_MODES: {
  value: ApplyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "merge",
    label: "Merge",
    description: "Keep existing shifts, add new",
  },
  {
    value: "replace-all",
    label: "Replace All",
    description: "Delete all existing shifts",
  },
  {
    value: "fill-gaps",
    label: "Fill Gaps",
    description: "Only add shifts into empty slots",
  },
];

interface ApplyTemplateBarProps {
  templateName: string;
  shiftsToAdd: number;
  conflictsDetected: number;
  applyMode: ApplyMode;
  onApplyModeChange: (mode: ApplyMode) => void;
  onCancel: () => void;
  onViewDetails: () => void;
  onApply: () => void;
}

const ApplyTemplateBar: React.FC<ApplyTemplateBarProps> = ({
  templateName,
  shiftsToAdd,
  conflictsDetected,
  applyMode,
  onApplyModeChange,
  onCancel,
  onViewDetails,
  onApply,
}) => {
  const sheetRef = useRef<BottomSheet>(null);
  const currentMode = APPLY_MODES.find((m) => m.value === applyMode)!;

  const handleOpenSheet = () => {
    sheetRef.current?.expand();
  };

  const handleSelectMode = (mode: ApplyMode) => {
    onApplyModeChange(mode);
    sheetRef.current?.close();
  };

  return (
    <>
      <View className="absolute bottom-0 left-0 right-0 bg-panel border-t border-border p-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-4">
          <Text className="text-white text-lg font-semibold">
            {templateName}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={handleOpenSheet}
            className="flex-row items-center gap-1 px-2 bg-gray-600"
          >
            <Text className="text-white text-sm">{currentMode.label}</Text>
            <ChevronDown size={16} color="white" />
          </Button>
        </View>

        <View className="flex-row items-center mx-4">
          {shiftsToAdd > 0 && (
            <View className="flex-row items-center mr-4 gap-1">
              <CheckCircle size={16} color={colors.success} className="mr-1" />
              <Text className="text-green-400 text-sm">
                {shiftsToAdd} shifts will be added
              </Text>
            </View>
          )}
          {conflictsDetected > 0 && (
            <View className="flex-row items-center gap-1">
              <AlertTriangle size={16} color={colors.warning} className="mr-1" />
              <Text className="text-yellow-400 text-sm">
                {conflictsDetected} conflicts detected
              </Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center">
          <Button
            variant="outline"
            onPress={onCancel}
            className="mr-2 rounded-lg"
          >
            <Text className="text-white">Cancel</Text>
          </Button>
          <Button
            variant="outline"
            onPress={onViewDetails}
            className="mr-2 rounded-lg"
          >
            <Text className="text-white">View Details</Text>
          </Button>
          <Button
            onPress={onApply}
            variant="secondary"
            className="bg-blue-600 rounded-lg"
          >
            <Text className="text-white font-semibold">Apply</Text>
          </Button>
        </View>
      </View>
      <ApplyModeSheet
        sheetRef={sheetRef as React.MutableRefObject<BottomSheet>}
        currentMode={applyMode}
        onSelectMode={handleSelectMode}
        onClose={() => sheetRef.current?.close()}
      />
    </>
  );
};

export default ApplyTemplateBar;
