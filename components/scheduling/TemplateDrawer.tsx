import { Sparkles } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useScheduleTemplateStore } from '@/stores/useScheduleTemplateStore'; // Import the store

interface TemplateDrawerProps {
  onApplyTemplate: (templateId: string) => void;
}

const TemplateDrawer: React.FC<TemplateDrawerProps> = ({ onApplyTemplate }) => {
  const { templates, activeTemplateIds } = useScheduleTemplateStore();

  const activeTemplates = React.useMemo(() => {
    return templates.filter(t => activeTemplateIds.includes(t.id));
  }, [templates, activeTemplateIds]);

  return (
    <View className="gap-y-3">
      <View className="flex-row items-center gap-2 mb-4">
        <Sparkles className="text-blue-400" size={16} color={"#60a5fa"} />
        <Text className="text-sm font-semibold text-white">Templates</Text>
      </View>
      {activeTemplates.length > 0 ? (
        activeTemplates.map((template) => (
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
        ))
      ) : (
        <Text className="text-xs text-gray-500 text-center px-4">
          No active templates set. Go to the template library to select up to 3 active templates.
        </Text>
      )}
    </View>
  );
};

export default TemplateDrawer;
