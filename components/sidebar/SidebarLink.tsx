import { LucideIcon } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity } from "react-native";

interface SidebarLinkProps {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  isExpanded: boolean;
  onPress: () => void;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({
  label,
  icon: Icon,
  isActive,
  isExpanded,
  onPress,
}) => {
  const activeBg = isActive ? "bg-blue-100" : "bg-transparent";
  const activeText = isActive ? "text-blue-600" : "text-gray-600";

  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-center py-3 px-4 rounded-lg ${activeBg}`}
    >
      <Icon className={activeText} size={22} strokeWidth={2.5} />
      {isExpanded && (
        <Text className={`ml-4 text-base font-semibold ${activeText}`}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

export default SidebarLink;
