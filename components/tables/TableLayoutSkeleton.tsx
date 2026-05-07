import { colors } from "@/lib/theme";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

interface TableLayoutSkeletonProps {
  tableCount?: number;
  showControls?: boolean;
}

const TableLayoutSkeleton: React.FC<TableLayoutSkeletonProps> = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.teal} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screen,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default React.memo(TableLayoutSkeleton);
