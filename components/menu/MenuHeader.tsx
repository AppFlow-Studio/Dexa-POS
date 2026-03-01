import { colors } from "@/lib/theme";
import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { Plus, RefreshCw, Search } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface MenuHeaderProps {
  title: string;
  onAddPress: () => void;
  addButtonLabel: string;
  disabled?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const MenuHeader: React.FC<MenuHeaderProps> = ({
  title,
  onAddPress,
  addButtonLabel,
  disabled = false,
  onRefresh,
  isRefreshing = false,
}) => {
  const { openSearch } = useMenuManagementSearchStore();

  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRefreshing) {
      const loop = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    } else {
      spinValue.setValue(0);
    }
  }, [isRefreshing]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View className="flex-row items-center justify-between bg-panel mb-4">
      <Text className="text-2xl font-bold text-white">{title}</Text>
      <View className="flex-row items-center gap-x-3">
        {onRefresh && (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isRefreshing}
            className={`p-3 bg-surface border border-gray-600 rounded-lg ${
              isRefreshing ? "opacity-50" : ""
            }`}
          >
            {isRefreshing ? (
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <RefreshCw color={colors.label} size={20} />
              </Animated.View>
            ) : (
              <RefreshCw color={colors.label} size={20} />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={openSearch}
          className="p-3 bg-surface border border-gray-600 rounded-lg"
        >
          <Search color={colors.label} size={20} />
        </TouchableOpacity>

        {/* Add Button */}
        <TouchableOpacity
          onPress={disabled ? undefined : onAddPress}
          disabled={disabled}
          className={`flex-row items-center px-4 py-3 rounded-lg ${
            disabled ? "bg-gray-600 opacity-50" : "bg-blue-600"
          }`}
        >
          <Plus size={20} color={disabled ? "#9CA3AF" : "white"} />
          <Text
            className={`text-base font-bold ml-2 ${
              disabled ? "text-gray-400" : "text-white"
            }`}
          >
            {addButtonLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MenuHeader;
