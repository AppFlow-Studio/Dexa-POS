import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import {
  kioskOrderTypeMetrics,
  kioskOrderTypeTileSize,
} from "@/components/kiosk/shared/kioskLayout";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskOrderType } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingBag, UtensilsCrossed } from "@/lib/icons";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

const OPTIONS: {
  type: KioskOrderType;
  label: string;
  hint: string;
  Icon: typeof UtensilsCrossed;
}[] = [
  {
    type: "dine_in",
    label: "Dine In",
    hint: "Eat here",
    Icon: UtensilsCrossed,
  },
  {
    type: "takeout",
    label: "Takeaway",
    hint: "Take it to go",
    Icon: ShoppingBag,
  },
];

// Entrance timings, kept together so KIOSK_ORDER_TYPE_ENTRANCE_MS stays true.
const SUBTITLE_DELAY_MS = 80;
const SUBTITLE_MS = 360;
const TILE_DELAY_MS = 120;
const TILE_STAGGER_MS = 70;

/**
 * How long this screen's entrance runs. The templates build the menu behind
 * this screen once it has played (useKioskOrderTypeStep), so that work doesn't
 * compete with the entrance for the frame budget.
 */
export const KIOSK_ORDER_TYPE_ENTRANCE_MS = Math.max(
  kioskMotion.slow,
  SUBTITLE_DELAY_MS + SUBTITLE_MS,
  TILE_DELAY_MS + TILE_STAGGER_MS * (OPTIONS.length - 1) + kioskMotion.slow,
);

/**
 * Shared order-type selection. The customer chooses Dine In or Takeaway; the
 * choice is stored on useKioskCartStore and becomes the order_type when the
 * order is created at checkout. Theme-driven from `config` so any template can
 * use it as a session entry step or a mid-session change screen.
 *
 * The two tiles are sized off the viewport rather than a fixed scaled px value
 * — they're the only content on screen, so on a big panel they should own it,
 * and on a phone they must still fit side by side (kioskOrderTypeTileSize).
 * All the type is sized from the tile too (kioskOrderTypeMetrics), so the
 * heading and labels stay in proportion to it on every panel.
 *
 * `selectedType` marks the tile the customer chose while the template finishes
 * the step (see useKioskOrderTypeStep). Once a tile is chosen, both stop taking
 * taps, so a second tap can't change the order type under the menu.
 */
export function KioskOrderTypeScreen({
  config,
  onSelect,
  selectedType = null,
}: {
  config: KioskConfig;
  onSelect: (type: KioskOrderType) => void;
  selectedType?: KioskOrderType | null;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const { width, height } = useWindowDimensions();
  const tileSize = kioskOrderTypeTileSize(width, height, s);
  const m = kioskOrderTypeMetrics(tileSize);

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: t.page }}
    >
      <Animated.Text
        entering={FadeInDown.duration(kioskMotion.slow)}
        style={{
          fontSize: m.title,
          lineHeight: Math.round(m.title * 1.22),
          letterSpacing: kioskTracking(m.title),
          ...kioskFont(t, "bold"),
          textAlign: "center",
          color: config.headerTextColor,
          marginBottom: Math.round(m.title * 0.22),
        }}
      >
        How would you like to order?
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.delay(SUBTITLE_DELAY_MS).duration(SUBTITLE_MS)}
        style={{
          fontSize: m.subtitle,
          color: t.textMuted,
          textAlign: "center",
          ...kioskFont(t, "regular"),
          marginBottom: m.headingGap,
        }}
      >
        Select an option to begin
      </Animated.Text>

      <View style={{ flexDirection: "row", gap: kioskPx(36, s) }}>
        {OPTIONS.map(({ type, label, hint, Icon }, index) => (
          <Animated.View
            key={type}
            entering={FadeInUp.delay(
              TILE_DELAY_MS + index * TILE_STAGGER_MS,
            ).duration(kioskMotion.slow)}
          >
            <KioskPressable
              onPress={() => onSelect(type)}
              disabled={selectedType != null}
              pressedScale={0.95}
              style={{
                width: tileSize,
                height: tileSize,
                borderRadius: kioskPx(kioskRadius.xl, s),
                alignItems: "center",
                justifyContent: "center",
                gap: m.innerGap,
                backgroundColor: t.surface,
                borderWidth: KIOSK_HAIRLINE,
                borderColor: t.outlineStrong,
              }}
            >
              <Icon color={t.primary} size={m.icon} />
              <View style={{ alignItems: "center", gap: m.labelGap }}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={{
                    fontSize: m.label,
                    letterSpacing: kioskTracking(m.label),
                    color: t.text,
                    ...kioskFont(t, "bold"),
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: m.hint,
                    color: t.textMuted,
                    ...kioskFont(t, "regular"),
                  }}
                >
                  {hint}
                </Text>
              </View>
              {selectedType === type ? (
                // A ring over the tile rather than a thicker border, so
                // marking the choice doesn't shift the tile's contents.
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: kioskPx(kioskRadius.xl, s),
                    borderWidth: kioskPx(3, s),
                    borderColor: t.primary,
                  }}
                />
              ) : null}
            </KioskPressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
