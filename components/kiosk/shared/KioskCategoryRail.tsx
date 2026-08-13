import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import type { Category } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Pressable, SectionList, Text, View } from "react-native";

export interface CategorySection {
  menuId: string;
  title: string;
  data: Category[];
}

/**
 * Shared category rail (the menu-screen sidebar) used by every kiosk
 * template. Card-style selected state — soft tinted background, a left
 * accent bar, and a small color dot — echoing KioskMenuItem's rounded,
 * softly-bordered look instead of a flat solid fill.
 */
export function KioskCategoryRail({
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

  return (
    <View
      style={{
        backgroundColor: config.backgroundColor,
        borderRightWidth: 1,
        borderRightColor: `${config.textColor}0F`,
      }}
      className="flex-1"
    >
      <SectionList
        sections={sections}
        keyExtractor={(cat, index) => `${cat.id}-${index}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingVertical: kioskPx(18, s),
          paddingHorizontal: kioskPx(14, s),
        }}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <View
            style={{
              paddingHorizontal: kioskPx(10, s),
              paddingTop:
                section.menuId === sections[0]?.menuId
                  ? kioskPx(4, s)
                  : kioskPx(26, s),
              paddingBottom: kioskPx(12, s),
            }}
          >
            <Text
              style={{
                fontSize: kioskPx(11, s),
                fontWeight: "800",
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: `${config.textColor}66`,
              }}
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item: cat, section }) => {
          const key = `${section.menuId}:${cat.id}`;
          const selected = key === resolvedKey;
          return (
            <Pressable
              onPress={() => onSelect(key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: kioskPx(12, s),
                paddingHorizontal: kioskPx(16, s),
                paddingVertical: kioskPx(16, s),
                marginBottom: kioskPx(8, s),
                borderRadius: kioskPx(18, s),
                backgroundColor: selected
                  ? `${config.primaryColor}12`
                  : "transparent",
                borderWidth: 1,
                borderColor: selected
                  ? `${config.primaryColor}30`
                  : "transparent",
                overflow: "hidden",
              }}
            >
              {/* Left accent bar — the selected marker, in place of a flat fill */}
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: kioskPx(10, s),
                  bottom: kioskPx(10, s),
                  width: kioskPx(4, s),
                  borderRadius: kioskPx(2, s),
                  backgroundColor: selected ? config.primaryColor : "transparent",
                }}
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: kioskPx(16, s),
                  fontWeight: selected ? "700" : "500",
                  color: selected ? config.primaryColor : config.textColor,
                }}
                numberOfLines={2}
              >
                {cat.name}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text
            style={{
              padding: kioskPx(20, s),
              color: `${config.textColor}99`,
            }}
          >
            No categories available.
          </Text>
        }
      />
    </View>
  );
}
