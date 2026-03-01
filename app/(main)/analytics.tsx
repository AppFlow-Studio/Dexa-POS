import { colors } from "@/lib/theme";
import { useRouter } from "expo-router";
import { BarChart3 } from "lucide-react-native";
import React, { useEffect } from "react";
import { Text, View } from "react-native";

const AnalyticsScreen = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new analytics dashboard
    router.replace('/analytics/analytics-dashboard');
  }, []);

  return (
    <View className="flex-1 bg-screen items-center justify-center">
      <BarChart3 color={colors.info} size={48} />
      <Text className="text-white text-xl mt-4">Redirecting to Analytics Dashboard...</Text>
    </View>
  );
};

export default AnalyticsScreen;
