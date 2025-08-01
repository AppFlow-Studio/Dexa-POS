import { LinearGradient } from "expo-linear-gradient";
import { LucideIcon } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

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
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {isActive ? (
        <>
          {isExpanded ? (
            <LinearGradient
              colors={[
                "rgba(101, 154, 240, 0.04)",
                "rgba(101, 154, 240, 0.12)",
              ]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 0 }}
              className="flex-row items-center py-3 px-4 rounded-xl overflow-hidden border-l-[3px] border-primary-400"
            >
              <Icon color="#659AF0" size={22} strokeWidth={2.5} />

              <Text className="ml-4 text-base font-medium text-primary-400">
                {label}
              </Text>
            </LinearGradient>
          ) : (
            <View className="flex-row items-center justify-center py-3 px-4 rounded-lg bg-transparent">
              <Icon color="#659AF0" size={22} strokeWidth={2.5} />
            </View>
          )}
        </>
      ) : (
        <View
          className={`flex-row items-center py-3 px-4 rounded-lg bg-transparent ${isExpanded ? "" : "justify-center"}`}
        >
          <Icon color="#2F2F3E" size={22} strokeWidth={2.5} />
          {isExpanded && (
            <Text className={`ml-4 text-base text-accent-400 font-medium`}>
              {label}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

export default SidebarLink;
