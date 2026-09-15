import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskCardSurface } from "@/components/kiosk/shared/kioskSurface";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Search } from "lucide-react-native";
import { useMemo } from "react";
import { Text, View } from "react-native";

/**
 * The menu-screen search affordance: a full-width bar that *looks* like a text
 * field but is a button, and opens KioskSearchOverlay.
 *
 * It is not a real input on purpose. A focusable field sitting above the grid
 * would raise the software keyboard in place — the app runs `adjustResize`, so
 * the window shrinks, the grid re-measures, and every card re-derives its
 * height budget and can flip between card shapes mid-keystroke. Promoting to a
 * dedicated screen keeps the browsing layout untouched, puts the input at the
 * top where the keyboard can never cover it, and gives the results the whole
 * panel. It also costs nothing until it's tapped: no index, no listeners, no
 * input state on the menu screen.
 *
 * One bar, one placement rule for every template: a full-width row at the top
 * of the menu content, under the header (and under the hero banner where a
 * template has one). Because it spans the rail as well as the grid, its
 * position matches what it does — it searches the whole menu, not the category
 * that happens to be selected.
 */
export function KioskSearchBar({
  config,
  onPress,
}: {
  config: KioskConfig;
  onPress: () => void;
}) {
  const s = useKioskUiScale();
  const surface = useMemo(
    () => kioskCardSurface(config.backgroundColor),
    [config.backgroundColor],
  );

  return (
    <View
      style={{
        paddingHorizontal: kioskPx(16, s),
        paddingTop: kioskPx(14, s),
        paddingBottom: kioskPx(4, s),
      }}
    >
      <KioskPressable
        onPress={onPress}
        pressedScale={0.985}
        accessibilityRole="search"
        accessibilityLabel="Search the menu"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: kioskPx(14, s),
          height: kioskPx(62, s),
          paddingHorizontal: kioskPx(22, s),
          borderRadius: kioskPx(18, s),
          backgroundColor: surface,
          borderWidth: 1,
          borderColor: `${config.accentColor}33`,
        }}
      >
        <Search size={kioskPx(24, s)} color={config.accentColor} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: kioskPx(20, s),
            fontWeight: "500",
            color: `${config.textColor}80`,
          }}
        >
          Search the menu
        </Text>
      </KioskPressable>
    </View>
  );
}
