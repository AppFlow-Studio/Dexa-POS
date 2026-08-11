import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
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
  /** Optional node rendered at the left of the action cluster (e.g. a "86'd (N)" chip). */
  rightSlot?: React.ReactNode;
}

const MenuHeader: React.FC<MenuHeaderProps> = ({
  title,
  onAddPress,
  addButtonLabel,
  disabled = false,
  onRefresh,
  isRefreshing = false,
  rightSlot,
}) => {
  const { openSearch } = useMenuManagementSearchStore();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

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
        marginBottom: s(12),
        paddingBottom: s(10),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>
        {title}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
        {rightSlot}
        {onRefresh && (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isRefreshing}
            style={{
              padding: s(6),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(8),
              opacity: isRefreshing ? 0.5 : 1,
            }}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw color={colors.label} size={s(14)} />
            </Animated.View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={openSearch}
          style={{
            padding: s(6),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
          }}
        >
          <Search color={colors.label} size={s(14)} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={disabled ? undefined : onAddPress}
          disabled={disabled}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(6),
            paddingHorizontal: s(12),
            paddingVertical: s(6),
            borderRadius: s(8),
            backgroundColor: disabled ? colors.card : colors.teal + "20",
            borderWidth: 1,
            borderColor: disabled ? colors.border : colors.teal + "50",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Plus size={s(14)} color={disabled ? colors.muted : colors.teal} />
          <Text
            style={{
              fontSize: s(12),
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
