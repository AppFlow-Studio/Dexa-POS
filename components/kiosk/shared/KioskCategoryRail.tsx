import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import type { Category } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { ChevronRight } from "lucide-react-native";
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
 * Shared category rail (the menu-screen sidebar) used by every kiosk
 * template. Card-style selected state — soft tinted background, a left
 * accent bar, and a chevron — echoing KioskMenuItem's rounded, softly-bordered
 * look instead of a flat solid fill. The accent bar and tint cross-fade
 * between rows rather than snapping, so the eye can follow the selection.
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
                fontSize: kioskPx(13, s),
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
        renderItem={({ item: cat, section }) => (
          <CategoryRow
            config={config}
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

function CategoryRow({
  config,
  name,
  selected,
  onPress,
}: {
  config: KioskConfig;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  const s = useKioskUiScale();
  // Drives every selected-state visual off one animated 0→1 value so the
  // tint, border and accent bar all move together.
  const progress = useDerivedValue(
    () => withTiming(selected ? 1 : 0, { duration: 200 }),
    [selected],
  );

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const barStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleY: 0.4 + progress.value * 0.6 }],
  }));

  return (
    <KioskPressable
      onPress={onPress}
      pressedScale={0.97}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(12, s),
        paddingHorizontal: kioskPx(18, s),
        paddingVertical: kioskPx(18, s),
        marginBottom: kioskPx(8, s),
        borderRadius: kioskPx(18, s),
        overflow: "hidden",
      }}
    >
      {/* Animated selected surface — sits under the content */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: kioskPx(18, s),
            backgroundColor: `${config.primaryColor}12`,
            borderWidth: 1,
            borderColor: `${config.primaryColor}30`,
          },
          surfaceStyle,
        ]}
      />

      {/* Left accent bar — the selected marker, in place of a flat fill */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 0,
            top: kioskPx(10, s),
            bottom: kioskPx(10, s),
            width: kioskPx(5, s),
            borderRadius: kioskPx(3, s),
            backgroundColor: config.primaryColor,
          },
          barStyle,
        ]}
      />

      <Text
        style={{
          flex: 1,
          fontSize: kioskPx(19, s),
          fontWeight: selected ? "700" : "500",
          color: selected ? config.primaryColor : config.textColor,
        }}
        numberOfLines={2}
      >
        {name}
      </Text>

      {selected && (
        <ChevronRight size={kioskPx(20, s)} color={config.primaryColor} />
      )}
    </KioskPressable>
  );
}
