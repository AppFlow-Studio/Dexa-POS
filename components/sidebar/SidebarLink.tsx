import { colors } from "@/lib/theme";
import { LinearGradient } from "expo-linear-gradient";
import { LucideIcon } from "lucide-react-native";
import React from "react";
import {
  GestureResponderEvent,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from "react-native";

interface SidebarLinkProps extends TouchableOpacityProps {
  label: string;
  icon?: LucideIcon;
  isActive: boolean;
  isExpanded: boolean;
  onCustomPress?: () => void;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({
  label,
  icon: Icon,
  isActive,
  isExpanded,
  onCustomPress,
  onPress,
  ...props
}) => {
  const handlePress = (event: GestureResponderEvent) => {
    if (onCustomPress) {
      onCustomPress();
    }
    if (onPress) {
      onPress(event);
    }
  };

  return (
    <TouchableOpacity {...props} onPress={handlePress} activeOpacity={0.7}>
      {isActive ? (
        <>
          {isExpanded ? (
            <View className="flex-row items-center py-3 px-2 rounded-xl overflow-hidden border-l-[3px] border-teal">
              <LinearGradient
                colors={[
                  "rgba(45, 212, 191, 0.0)",
                  "rgba(45, 212, 191, 0.12)",
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                className="absolute inset-0"
              />
              {Icon && <Icon color={colors.teal} size={22} strokeWidth={2.5} />}
              <Text className="ml-4 text-base font-medium text-teal">
                {label}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center justify-center py-3 px-4 rounded-lg bg-transparent">
              {Icon && <Icon color={colors.teal} size={22} strokeWidth={2.5} />}
            </View>
          )}
        </>
      ) : (
        <View
          className={`flex-row items-center py-3 px-2 rounded-lg bg-transparent ${
            isExpanded ? "" : "justify-center"
          }`}
        >
          {!!Icon && <Icon color={colors.label} size={22} strokeWidth={2.5} />}
          {isExpanded && (
            <Text className={`ml-4 text-base text-label font-medium`}>
              {label}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

export default SidebarLink;
