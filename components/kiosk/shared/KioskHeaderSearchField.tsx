import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskRadius,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KIOSK_HEADER_CONTROL_HEIGHT } from "@/components/kiosk/shared/kioskLayout";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Search, X } from "lucide-react-native";
import { TextInput } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

/**
 * The live search field, which takes over the header's logo slot while search
 * is open.
 *
 * Putting it here rather than in a row of its own is the whole point: the menu
 * screen has no chrome between the header and the first tile, so the category
 * rail and the grid both start immediately under the header and keep every
 * pixel of the panel. The logo is the one thing in the header that can be
 * stood down for a moment - Start Over and the cart stay put beside the field,
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
  const t = useKioskTheme(config);
  const control = kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s);

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: control,
        paddingLeft: kioskPx(16, s),
        borderRadius: kioskPx(kioskRadius.md, s),
        backgroundColor: t.sunken,
        borderWidth: KIOSK_HAIRLINE,
        borderColor: t.outlineStrong,
      }}
    >
      <Search size={kioskPx(22, s)} color={t.textMuted} strokeWidth={1.75} />

      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        placeholder={kioskStrings.searchPlaceholder}
        placeholderTextColor={t.textFaint}
        selectionColor={t.primary}
        style={{
          flex: 1,
          marginLeft: kioskPx(12, s),
          fontSize: kioskPx(18, s),
          color: t.text,
          // RN gives Android inputs their own vertical padding; zeroing it
          // keeps the text on the field's centre line at every UI scale.
          paddingVertical: 0,
          ...kioskFont(t, "regular"),
        }}
      />

      <KioskPressable
        onPress={onClose}
        pressedScale={0.94}
        accessibilityRole="button"
        accessibilityLabel={kioskStrings.searchClose}
        style={{
          width: control,
          height: control,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={kioskPx(20, s)} color={t.textMuted} strokeWidth={1.75} />
      </KioskPressable>
    </Animated.View>
  );
}
