import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, ChevronDown } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ApplyTemplateBarProps {
  templateName: string;
  shiftsToAdd: number;
  conflictsDetected: number;
  onCancel: () => void;
  onViewDetails: () => void;
  onApply: () => void;
}

const ApplyTemplateBar: React.FC<ApplyTemplateBarProps> = ({
  templateName,
  shiftsToAdd,
  conflictsDetected,
  onCancel,
  onViewDetails,
  onApply,
}) => {
  return (
    <View className="absolute bottom-0 left-0 right-0 bg-[#303030] border-t border-gray-700 p-4 flex-row items-center justify-between">
      <View className="flex-row items-center">
        <Text className="text-white text-lg font-semibold mr-2">
          {templateName}
        </Text>
        <TouchableOpacity className="flex-row items-center p-1 rounded-md bg-gray-600">
          <Text className="text-white text-sm mr-1">Merge</Text>
          <ChevronDown size={16} color="#FFFFFF" />
        </TouchableOpacity>
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
