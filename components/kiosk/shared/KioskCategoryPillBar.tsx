import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Pressable, ScrollView, Text, View } from "react-native";

export interface CategoryPill {
  key: string;
  name: string;
}

/**
 * Horizontal scrollable category selector — one pill per unique category
 * name. Unlike KioskCategoryRail (which groups by menu, so same-named
 * categories in different menus each get their own visible section), this
 * bar has no per-menu grouping — callers are expected to have already
 * deduped/merged same-named categories before building `pills`, otherwise a
 * category shared by two menus would render as two identical, unexplained
 * pills. Used by templates that lay their menu out as a single scrollable
 * list rather than a sidebar + grid split.
 */
export function KioskCategoryPillBar({
  config,
  pills,
  resolvedKey,
  onSelect,
}: {
  config: KioskConfig;
  pills: CategoryPill[];
  resolvedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const s = useKioskUiScale();

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
