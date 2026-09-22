import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
  type KioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import type { Category } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { SectionList, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";

export interface CategorySection {
  menuId: string;
  title: string;
  data: Category[];
}

/**
 * Shared category rail (the menu-screen sidebar) used by every kiosk template.
 *
 * The selected row is filled — the same marker, radius and colour as the
 * horizontal tab strip in Template C, so a customer who meets both is reading
 * one language. A rule down the leading edge was tried instead and was too
 * quiet: at a kiosk the customer is standing back from the panel and glancing
 * at the sidebar between decisions, which is not the viewing distance at which
 * a two pixel mark registers.
 *
 * The fill cross-fades between rows rather than snapping, so the eye can
 * follow the selection.
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
  const t = useKioskTheme(config);

  return (
    <View
      style={{
        backgroundColor: t.page,
        borderRightWidth: KIOSK_HAIRLINE,
        borderRightColor: t.outline,
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
                fontSize: kioskPx(12, s),
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: t.textFaint,
                ...kioskFont(t, "bold"),
              }}
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item: cat, section }) => (
          <CategoryRow
            theme={t}
            name={cat.name}
            selected={`${section.menuId}:${cat.id}` === resolvedKey}
            onPress={() => onSelect(`${section.menuId}:${cat.id}`)}
          />
        )}
        ListEmptyComponent={
          <Text
            style={{
              padding: kioskPx(20, s),
              fontSize: kioskPx(16, s),
              color: t.textMuted,
              ...kioskFont(t, "regular"),
            }}
          >
            No categories available.
          </Text>
        }
      />
    </View>
  );
}

function CategoryRow({
  theme: t,
  name,
  selected,
  onPress,
}: {
  theme: KioskTheme;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  const s = useKioskUiScale();
  const progress = useDerivedValue(
    () => withTiming(selected ? 1 : 0, { duration: kioskMotion.base }),
    [selected],
  );

  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <KioskPressable
      onPress={onPress}
      pressedScale={0.97}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(12, s),
        paddingHorizontal: kioskPx(16, s),
        paddingVertical: kioskPx(16, s),
        marginBottom: kioskPx(6, s),
        borderRadius: kioskPx(kioskRadius.md, s),
      }}
    >
      {/* The marker, cross-faded so the selection moves rather than jumps. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: kioskPx(kioskRadius.md, s),
            backgroundColor: t.primary,
          },
          fillStyle,
        ]}
      />

      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          fontSize: kioskPx(18, s),
          lineHeight: kioskPx(24, s),
          letterSpacing: kioskTracking(18),
          color: selected ? t.onPrimary : t.textMuted,
          ...kioskFont(t, selected ? "bold" : "regular"),
        }}
      >
        {name}
      </Text>
    </KioskPressable>
  );
}
