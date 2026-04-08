import { colors } from "@/lib/theme";
import { ScheduleTemplate } from "@/lib/types";
import { ChevronDown } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TemplateEditorHeaderProps {
  template: Partial<ScheduleTemplate>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const TemplateEditorHeader: React.FC<TemplateEditorHeaderProps> = ({
  template,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const tagSummary =
    template.tags && template.tags.length > 0
      ? `${template.tags.length} tag(s)`
      : "No tags";

  return (
    <View className="mb-4 bg-panel border border-border rounded-xl">
      <TouchableOpacity
        onPress={() => setIsOpen(!isOpen)}
        className="p-4 flex-row justify-between items-center"
      >
        {!isOpen ? (
          <View>
            <Text className="text-xl font-bold text-white">
              {template.name || "New Template"}
            </Text>
            <Text className="text-gray-400 mt-1">
              {template.description?.substring(0, 40) || "No description"}
              ... • {tagSummary}
            </Text>
          </View>
        ) : (
          <Text className="text-xl font-bold text-white">
            Editing Template Details
          </Text>
        )}
        <ChevronDown
          color={colors.label}
          size={24}
          style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
        />
      </TouchableOpacity>

      {isOpen && (
        <View className="p-4 border-t border-gray-700">{children}</View>
      )}
    </View>
  );
};

export default TemplateEditorHeader;
