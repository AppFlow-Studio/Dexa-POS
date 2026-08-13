import { CHANNEL_TABS, type ChannelTab } from "@/lib/previousOrdersFilters";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import React from "react";
import { Pressable, Text, View } from "react-native";

interface ChannelTabBarProps {
  active: ChannelTab;
  counts: Record<ChannelTab, number>;
  /**
   * False while the window counts are still loading. A real 0 and an unknown
   * count look identical otherwise, and the list is often painted from cache
   * before the counts land — five zeroes over a full list reads as broken.
   */
  countsReady?: boolean;
  onSelect: (tab: ChannelTab) => void;
}

/**
 * Channel tabs with live counts. Five fixed tabs at 1920px never overflow, so
 * this row deliberately has no ScrollView — the "false edge" the old pill strip
 * created is impossible here.
 */
const ChannelTabBarContent: React.FC<ChannelTabBarProps> = ({
  active,
  counts,
  countsReady = true,
  onSelect,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {CHANNEL_TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(8),
              height: s(44),
              paddingHorizontal: s(16),
              borderBottomWidth: s(2),
              borderBottomColor: isActive ? colors.teal : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: s(14),
                fontWeight: isActive ? "700" : "600",
                color: isActive ? colors.teal : colors.label,
              }}
            >
              {tab.label}
            </Text>
            <View
              style={{
                minWidth: s(22),
                height: s(22),
                paddingHorizontal: s(6),
                // Exactly half the height: a magic 999 radius is not clamped
                // reliably on Android's New Architecture and renders square.
                borderRadius: s(22) / 2,
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
                // Never "transparent": toggling between transparent and solid
                // lets Fabric reuse the background drawable without reapplying
                // the corner radius, so the badge randomly rendered square.
                // A view that always draws a background keeps its radius.
                // Inactive uses a 1/255-alpha teal: visually nothing, but the
                // drawable is real so the radius is applied on first paint.
                backgroundColor: isActive ? colors.teal : colors.teal + "01",
              }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "700",
                  color: isActive ? colors.onSolid : colors.muted,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {countsReady ? (counts[tab.key] ?? 0) : "–"}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

const ChannelTabBar = React.memo(ChannelTabBarContent);
export default ChannelTabBar;
