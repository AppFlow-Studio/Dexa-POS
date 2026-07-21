import { useColorScheme } from "@/lib/useColorScheme";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

interface TableLayoutSkeletonProps {
  tableCount?: number;
  showControls?: boolean;
}

const TableLayoutSkeleton: React.FC<TableLayoutSkeletonProps> = () => {
  const { isDarkColorScheme } = useColorScheme();
  const backgroundColor = isDarkColorScheme ? "#0C0F1A" : "#F8FAFC";
  const spinnerColor = isDarkColorScheme ? "#adc6ff" : "#0C4FD1";

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ActivityIndicator size="large" color={spinnerColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default React.memo(TableLayoutSkeleton);
