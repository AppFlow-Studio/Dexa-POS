import { useUiScale } from "@/lib/uiScale";
import { useRouter } from "expo-router";
import { BarChart3 } from "lucide-react-native";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/lib/theme";

const AnalyticsScreen = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const router = useRouter();

  useEffect(() => {
    router.replace('/analytics/analytics-dashboard');
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, alignItems: 'center', justifyContent: 'center', gap: s(12) }}>
      <View style={{ width: s(52), height: s(52), borderRadius: s(14), backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30', alignItems: 'center', justifyContent: 'center' }}>
        <BarChart3 color={colors.teal} size={s(24)} />
      </View>
      <ActivityIndicator color={colors.teal} size="small" />
    </View>
  );
};

export default AnalyticsScreen;
