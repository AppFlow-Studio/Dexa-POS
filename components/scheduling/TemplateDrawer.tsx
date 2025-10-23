import { Sparkles } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface Template {
  id: string;
  name: string;
  description: string;
}

const templates: Template[] = [
  {
    id: "slow",
    name: "Slow Weekday",
    description: "Minimal coverage for quiet periods",
  },
  {
    id: "weekend",
    name: "Weekend Rush",
    description: "Full staffing for peak hours",
  },
  {
    id: "holiday",
    name: "Holiday Lite",
    description: "Reduced hours with key staff",
  },
];

interface TemplateDrawerProps {
  onApplyTemplate: (templateId: string) => void;
}

const TemplateDrawer: React.FC<TemplateDrawerProps> = ({ onApplyTemplate }) => {
  return (
    <View className="gap-y-3">
      <View className="flex-row items-center gap-2 mb-4">
        <Sparkles className="text-blue-400" size={16} color={"#60a5fa"} />
        <Text className="text-sm font-semibold text-white">Templates</Text>
      </View>
      {templates.map((template) => (
        <TouchableOpacity
          key={template.id}
          className="p-3 bg-[#212121] border border-gray-700 rounded-lg active:border-blue-500"
          onPress={() => onApplyTemplate(template.id)}
        >
          <Text className="text-sm font-medium text-white mb-1">
            {template.name}
          </Text>
          <Text className="text-xs text-gray-400 leading-relaxed">
            {template.description}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default TemplateDrawer;
