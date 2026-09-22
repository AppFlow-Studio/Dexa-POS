import {
  kioskCardMetrics,
  type KioskCardMetrics,
} from "@/components/kiosk/shared/kioskCardMetrics";
import {
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
  type KioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskItemQuantity } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import React, { useMemo } from "react";
import { Image, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * Kiosk menu card - photograph, then name, description and price.
 *
 * The photograph is the product and is treated as such: it bleeds to three
 * edges with no border cutting it, it meets the copy on a clean edge, and it
 * is the card's one flexible block (see `cardHeight`). The card itself is a
 * flat surface a step off the page, with no outline and no shadow - one fill,
 * one radius, nothing drawn that does not carry information.
 *
 * Every size comes from `kioskCardMetrics(cardWidth)`, where `cardWidth` is
 * measured by the parent grid, and every type size it returns is a step on the
 * shared scale. That is what makes the card responsive to both screen size and
 * the manager's items-per-row setting without the type drifting to a different
 * arbitrary value at every column count.
 *
 * Kiosk-native (not the POS MenuItem): themed entirely from `config`, no
 * clock-in wall, no useOrderStore / useModifierSidebarStore coupling. Tapping
 * calls `onPress(item)`, which opens the item's popup — there is no separate
 * add control on the card. Every item goes through the popup, so one tap means
 * one thing everywhere on the grid.
 */
interface KioskMenuItemProps {
  item: MenuItemType;
  config: KioskConfig;
  /** Measured width of one card, from the parent grid. */
  cardWidth: number;
  /** Height budget for one card, from the parent grid's measured height. */
  maxCardHeight?: number;
  onPress: (item: MenuItemType) => void;
}

const KioskMenuItem: React.FC<KioskMenuItemProps> = ({
  item,
  config,
  cardWidth,
  maxCardHeight,
  onPress,
}) => {
  const t = useKioskTheme(config);
  const m = useMemo(
    () => kioskCardMetrics(cardWidth, maxCardHeight),
    [cardWidth, maxCardHeight],
  );
  const isDisabled = item.availability === false;
  const qtyInCart = useKioskItemQuantity(item.id);
  const inCart = qtyInCart > 0;

  const resolvedImageSource = useMemo(
    () => resolveMenuItemImageSource(item.image),
    [item.image],
  );

  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  return (
    <KioskPressable
      disabled={isDisabled}
      pressedScale={0.98}
      onPress={() => onPress(item)}
      style={{
        flex: 1,
        borderRadius: m.radius,
        overflow: "hidden",
        backgroundColor: t.surface,
        opacity: isDisabled ? 0.55 : 1,
      }}
    >
      {/* The photo is the flexible block. Whatever the copy does not use - a
          one-line name where two were budgeted, a missing description - it
          takes back, instead of the card holding an empty line. */}
      <View style={{ flex: 1, width: "100%" }}>
        {resolvedImageSource ? (
          <Image
            source={resolvedImageSource}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: t.sunken,
            }}
          >
            <PlaceholderIcon color={t.textFaint} size={m.placeholderSize} />
          </View>
        )}

        {inCart && !isDisabled ? <InCartBadge qty={qtyInCart} t={t} m={m} /> : null}

        {isDisabled ? <SoldOutVeil t={t} m={m} /> : null}
      </View>

      <View
        style={{
          paddingHorizontal: m.padH,
          paddingTop: m.padV,
          // Rounded, because `cardHeight` sums this exact value.
          paddingBottom: Math.round(m.padV * 1.2),
          gap: m.gap,
        }}
      >
        <Text
          numberOfLines={m.nameLines}
          style={{
            fontSize: m.nameSize,
            lineHeight: m.nameLineHeight,
            letterSpacing: kioskTracking(m.nameSize),
            color: t.text,
            ...kioskFont(t, "bold"),
          }}
        >
          {item.name}
        </Text>

        {m.showDescription && (
          <Text
            numberOfLines={m.descLines}
            style={{
              fontSize: m.descSize,
              lineHeight: m.descLineHeight,
              color: t.textMuted,
              ...kioskFont(t, "regular"),
            }}
          >
            {item.description ?? ""}
          </Text>
        )}

        {/* Fixed height, because `cardHeight` sums this exact value and an
            intrinsically-sized row would make that sum a guess. */}
        <View
          style={{
            justifyContent: "center",
            height: m.priceRowHeight,
          }}
        >
          <Text
            style={{
              fontSize: m.priceSize,
              letterSpacing: kioskTracking(m.priceSize),
              color: t.text,
              fontVariant: ["tabular-nums"],
              ...kioskFont(t, "bold"),
            }}
          >
            ${item.price?.toFixed(2)}
          </Text>
        </View>
      </View>
    </KioskPressable>
  );
};

/**
 * "N in cart" mark. A plain count on the photograph's corner, which is all the
 * information there is - the cart glyph that used to sit beside it repeated
 * what the header already says and made the mark twice the size.
 *
 * It ticks on every quantity change so adding a second of the same item is
 * visible from standing distance without the customer re-reading the number.
 */
function InCartBadge({
  qty,
  t,
  m,
}: {
  qty: number;
  t: KioskTheme;
  m: KioskCardMetrics;
}) {
  const pop = useSharedValue(1);

  React.useEffect(() => {
    pop.value = 1.12;
    pop.value = withTiming(1, {
      duration: kioskMotion.base,
      easing: kioskMotion.easing,
    });
  }, [qty, pop]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: m.padV * 0.8,
          left: m.padH * 0.7,
          minWidth: m.badgeTextSize * 1.9,
          paddingHorizontal: m.padH * 0.35,
          paddingVertical: m.padV * 0.22,
          borderRadius: kioskRadius.xs,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.primary,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: t.onPrimary,
          fontSize: m.badgeTextSize,
          fontVariant: ["tabular-nums"],
          ...kioskFont(t, "bold"),
        }}
      >
        {qty}
      </Text>
    </Animated.View>
  );
}

/**
 * 86'd state. The whole photograph goes under a veil with one small label
 * across it, rather than a black bar pinned to its foot - the item is
 * unavailable, not annotated.
 */
function SoldOutVeil({ t, m }: { t: KioskTheme; m: KioskCardMetrics }) {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(12,12,14,0.42)",
      }}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: m.descSize,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          ...kioskFont(t, "bold"),
        }}
      >
        {kioskStrings.soldOut}
      </Text>
    </View>
  );
}

export default React.memo(KioskMenuItem, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.price === next.item.price &&
    prev.item.availability === next.item.availability &&
    prev.item.name === next.item.name &&
    prev.item.description === next.item.description &&
    prev.item.image === next.item.image &&
    prev.cardWidth === next.cardWidth &&
    prev.maxCardHeight === next.maxCardHeight &&
    prev.config.accentColor === next.config.accentColor &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.primaryColor === next.config.primaryColor &&
    prev.config.textColor === next.config.textColor &&
    prev.onPress === next.onPress
  );
});
