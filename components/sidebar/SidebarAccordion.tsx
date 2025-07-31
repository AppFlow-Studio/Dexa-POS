import { SidebarItem } from "@/lib/sidebar-data";
import { ChevronDown } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SidebarAccordionProps {
  item: SidebarItem;
  isOpen: boolean;
  onToggle: () => void;
  activeId: string | null;
  onSubItemPress: (id: string) => void;
  isExpanded: boolean;
}

const SidebarAccordion: React.FC<SidebarAccordionProps> = ({
  item,
  isOpen,
  onToggle,
  activeId,
  onSubItemPress,
  isExpanded,
}) => {
  const { label, icon: Icon, subItems = [] } = item;
  const isParentActive = subItems.some((sub) => sub.id === activeId);
  const parentTextColor = isParentActive ? "text-blue-600" : "text-gray-600";

  if (!isExpanded) {
    // Collapsed view only shows the main icon
    return (
      <TouchableOpacity
        onPress={onToggle}
        className="flex-row items-center py-3 px-4 rounded-lg"
      >
        <Icon className={parentTextColor} size={22} strokeWidth={2.5} />
      </TouchableOpacity>
    );
  }

  // Expanded View
  return (
    <View>
      <TouchableOpacity
        onPress={onToggle}
        className="flex-row items-center justify-between py-3 px-4 rounded-lg"
      >
        <View className="flex-row items-center">
          <Icon className={parentTextColor} size={22} strokeWidth={2.5} />
          <Text className={`ml-4 text-base font-semibold ${parentTextColor}`}>
            {label}
          </Text>
        </View>
        <ChevronDown
          className={`transition-transform ${isOpen ? "rotate-180" : ""} ${parentTextColor}`}
          size={20}
        />
      </TouchableOpacity>

      {isOpen && (
        <View className="ml-7 pl-4 border-l border-gray-200">
          {subItems.map((subItem) => {
            const isSubActive = activeId === subItem.id;
            const activeSubBg = isSubActive ? "bg-blue-100" : "bg-transparent";
            const activeSubText = isSubActive
              ? "text-blue-600"
              : "text-gray-500";
            return (
              <TouchableOpacity
                key={subItem.id}
                onPress={() => onSubItemPress(subItem.id)}
                className={`py-2 px-3 my-0.5 rounded-md ${activeSubBg}`}
              >
                <Text className={`font-semibold ${activeSubText}`}>
                  {subItem.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

export default SidebarAccordion;
