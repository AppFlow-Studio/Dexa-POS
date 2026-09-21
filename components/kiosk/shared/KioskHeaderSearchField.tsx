import { KIOSK_HEADER_CONTROL_HEIGHT } from "@/components/kiosk/shared/kioskLayout";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { kioskCardSurface } from "@/components/kiosk/shared/kioskSurface";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Search, X } from "lucide-react-native";
import { useMemo } from "react";
import { TextInput } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";


/**
 * The live search field, which takes over the header's logo slot while search
 * is open.
 *
 * Putting it here rather than in a row of its own is the whole point: the menu
 * screen has no chrome between the header and the first tile, so the category
 * rail and the grid both start immediately under the header and keep every
 * pixel of the panel. The logo is the one thing on the header that can be
 * stood down for a moment — Start Over and the cart stay put beside the field,
 * so nothing the customer might need mid-search disappears.
 *
 * Mounted only while open, so `autoFocus` fires on each expand.
 */
export function KioskHeaderSearchField({
  config,
  query,
  onChangeQuery,
  onClose,
}: {
  config: KioskConfig;
  query: string;
  onChangeQuery: (value: string) => void;
  onClose: () => void;
}) {
  const s = useKioskUiScale();
  const surface = useMemo(
    () => kioskCardSurface(config.backgroundColor),
    [config.backgroundColor],
  );

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
        paddingLeft: kioskPx(16, s),
        borderRadius: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s) / 2,
        backgroundColor: surface,
        borderWidth: 1,
        borderColor: `${config.accentColor}40`,
      }}
    >
      <Search size={kioskPx(24, s)} color={config.accentColor} />

      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        placeholder={kioskStrings.searchPlaceholder}
        placeholderTextColor={`${config.textColor}80`}
        selectionColor={config.accentColor}
        style={{
          flex: 1,
          marginLeft: kioskPx(12, s),
          fontSize: kioskPx(20, s),
          fontWeight: "500",
          color: config.textColor,
          // RN gives Android inputs their own vertical padding; zeroing it
          // keeps the text on the field's centre line at every UI scale.
          paddingVertical: 0,
        }}
      />

      <KioskPressable
        onPress={onClose}
        pressedScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={kioskStrings.searchClose}
        style={{
          width: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
          height: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={kioskPx(22, s)} color={config.textColor} />
      </KioskPressable>
    </Animated.View>
  );
}
