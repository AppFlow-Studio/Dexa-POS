import { colors } from "@/lib/theme";
import { useRouter } from "expo-router";
import { BarChart3 } from "lucide-react-native";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

const AnalyticsScreen = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/analytics/analytics-dashboard');
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30', alignItems: 'center', justifyContent: 'center' }}>
        <BarChart3 color={colors.teal} size={24} />
      </View>
      <ActivityIndicator color={colors.teal} size="small" />
    </View>
  );
};

export default AnalyticsScreen;
