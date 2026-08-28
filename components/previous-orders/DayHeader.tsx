import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import React from "react";
import { Text, View } from "react-native";

interface DayHeaderProps {
  title: string;
  count: number;
  /** Omit the top gap on the first group — the list's own padding handles it. */
  first?: boolean;
}

/**
 * Day separator for the Previous Orders list. Rendered between consecutive
 * same-day runs so staff can scan a page by day at a glance.
 */
const DayHeader: React.FC<DayHeaderProps> = ({ title, count, first }) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: first ? 0 : s(4),
        paddingHorizontal: s(12),
        paddingVertical: s(5),
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: s(11),
          fontWeight: "700",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.teal,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.muted }}>
        {count} {count === 1 ? "order" : "orders"}
      </Text>
    </View>
  );
};

export default DayHeader;
