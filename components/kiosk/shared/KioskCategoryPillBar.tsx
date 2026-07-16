import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import type { CategorySection } from "@/components/kiosk/shared/KioskCategoryRail";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Pressable, ScrollView, Text, View } from "react-native";

/**
 * Horizontal scrollable category selector — a pill per category, flattened
 * across all menus (no per-menu grouping, unlike KioskCategoryRail). Used by
 * templates that lay their menu out as a single scrollable list rather than
 * a sidebar + grid split.
 */
export function KioskCategoryPillBar({
  config,
  sections,
  resolvedKey,
  onSelect,
}: {
  config: KioskConfig;
  sections: CategorySection[];
  resolvedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const s = useKioskUiScale();
  const pills = sections.flatMap((section) =>
    section.data.map((cat) => ({
      key: `${section.menuId}:${cat.id}`,
      name: cat.name,
    })),
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: kioskPx(16, s),
        paddingVertical: kioskPx(12, s),
      }}
    >
      {pills.map(({ key, name }) => {
        const selected = key === resolvedKey;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            style={{
              marginRight: kioskPx(10, s),
              paddingHorizontal: kioskPx(24, s),
              paddingVertical: kioskPx(14, s),
              borderRadius: 999,
              backgroundColor: selected
                ? config.primaryColor
                : `${config.primaryColor}0F`,
              borderWidth: 1,
              borderColor: selected
                ? config.primaryColor
                : `${config.textColor}14`,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: kioskPx(16, s),
                fontWeight: selected ? "700" : "500",
                color: selected ? "#FFFFFF" : config.textColor,
              }}
            >
              {name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
