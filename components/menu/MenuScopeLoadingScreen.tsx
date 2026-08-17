import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { ActivityIndicator, Text, View } from "react-native";

export function MenuScopeLoadingScreen() {
  const uiScale = useUiScale();
  const s = (value: number) => Math.round(value * uiScale);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: s(12),
        backgroundColor: colors.panel,
      }}
    >
      <ActivityIndicator size="large" color={colors.teal} />
      <Text style={{ color: colors.heading, fontSize: s(16) }}>
        Loading menu...
      </Text>
    </View>
  );
}
