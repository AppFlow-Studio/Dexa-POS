import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApplyMode } from "@/lib/types";
import {
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

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
  const currentMode = APPLY_MODES.find((m) => m.value === applyMode)!;

  return (
    <View className="absolute bottom-0 left-0 right-0 bg-[#303030] border-t border-gray-700 p-4 flex-row items-center justify-between">
      <View className="flex-row items-center gap-4">
        <Text className="text-white text-lg font-semibold">{templateName}</Text>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex-row items-center gap-1 px-2 bg-gray-600"
            >
              <Text className="text-white text-sm">{currentMode.label}</Text>
              <ChevronDown size={16} color="white" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="bg-[#1f2937] border-[#374151]"
          >
            {APPLY_MODES.map((mode) => (
              <DropdownMenuItem
                key={mode.value}
                onPress={() => onApplyModeChange(mode.value)}
                className="text-white hover:bg-[#374151] cursor-pointer"
              >
                <View className="flex-row items-center gap-2">
                  {applyMode === mode.value ? (
                    <CheckCircle2 size={16} color="#3b82f6" />
                  ) : (
                    <View className="w-4" /> // Placeholder for alignment
                  )}
                  <View>
                    <Text className="font-medium text-white">{mode.label}</Text>
                    <Text className="text-xs text-gray-400">
                      {mode.description}
                    </Text>
                  </View>
                </View>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </View>

      <View className="flex-row items-center mx-4">
        {shiftsToAdd > 0 && (
          <View className="flex-row items-center mr-4 gap-1">
            <CheckCircle size={16} color="#22c55e" className="mr-1" />
            <Text className="text-green-400 text-sm">
              {shiftsToAdd} shifts will be added
            </Text>
          </View>
        )}
        {conflictsDetected > 0 && (
          <View className="flex-row items-center gap-1">
            <AlertTriangle size={16} color="#facc15" className="mr-1" />
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
  );
};

export default ApplyTemplateBar;
