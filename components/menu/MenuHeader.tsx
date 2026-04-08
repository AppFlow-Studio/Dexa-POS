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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
        {title}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {onRefresh && (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isRefreshing}
            style={{
              padding: 6,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              opacity: isRefreshing ? 0.5 : 1,
            }}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw color={colors.label} size={14} />
            </Animated.View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={openSearch}
          style={{
            padding: 6,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
          }}
        >
          <Search color={colors.label} size={14} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={disabled ? undefined : onAddPress}
          disabled={disabled}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: disabled ? colors.card : colors.teal + "20",
            borderWidth: 1,
            borderColor: disabled ? colors.border : colors.teal + "50",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Plus size={14} color={disabled ? colors.muted : colors.teal} />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: disabled ? colors.muted : colors.teal,
            }}
          >
            {addButtonLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MenuHeader;
