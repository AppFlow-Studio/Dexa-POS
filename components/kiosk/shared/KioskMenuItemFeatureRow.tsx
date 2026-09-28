import {
  kioskFeatureRowMetrics,
  type KioskFeatureRowMetrics,
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
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { kioskCardSurface } from "@/components/kiosk/shared/kioskSurface";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
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
 * Feature row — the one-item-per-row menu card.
 *
 * Selected by setting "Items per row" to 1 (Kiosk Settings → Menu Layout).
 * One item per row gives each dish a full-width band: name, description and
 * price on the left, the photo on the right.
 *
 * The photo is a crisp rounded square inset in the row — one `pad` from every
 * edge — rather than an image bleeding off the card and dissolved into it by a
 * gradient. The card's corner radius is the photo's plus that inset, so the two
 * curves run parallel. Nothing on the card fades: the photo appears as soon as
 * it decodes (`fadeDuration={0}` — Android otherwise fades every RN image in),
 * and the in-cart count ticks without bouncing, like the grid card's.
 *
 * Same surface as the other kiosk cards: `kioskCardSurface` fill, no cast
 * shadow (see the shadows note in docs/features/kiosk).
 */
interface KioskMenuItemFeatureRowProps {
  item: MenuItemType;
  config: KioskConfig;
  /** Measured width of the row, from the parent grid. */
  cardWidth: number;
  /** Height budget from the grid — only caps the row on short viewports. */
  maxCardHeight?: number;
  onPress: (item: MenuItemType) => void;
}

const KioskMenuItemFeatureRow: React.FC<KioskMenuItemFeatureRowProps> = ({
  item,
  config,
  cardWidth,
  maxCardHeight,
  onPress,
}) => {
  const m = useMemo(
    () => kioskFeatureRowMetrics(cardWidth, maxCardHeight),
    [cardWidth, maxCardHeight],
  );
  const isDisabled = item.availability === false;
  const qtyInCart = useKioskItemQuantity(item.id);

  const resolvedImageSource = useMemo(
    () => resolveMenuItemImageSource(item.image),
    [item.image],
  );

  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  const t = useKioskTheme(config);
  const surface = useMemo(
    () => kioskCardSurface(config.backgroundColor),
    [config.backgroundColor],
  );

  return (
    <KioskPressable
      disabled={isDisabled}
      pressedScale={0.98}
      onPress={() => onPress(item)}
      style={{
        height: m.height,
        flexDirection: "row",
        alignItems: "center",
        gap: m.pad,
        padding: m.pad,
        borderRadius: m.radius,
        backgroundColor: surface,
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      {/* Copy */}
      <View style={{ flex: 1, justifyContent: "center", gap: m.gap }}>
        <Text
          style={{
            fontSize: m.nameSize,
            lineHeight: m.nameLineHeight,
            letterSpacing: kioskTracking(m.nameSize),
            color: config.textColor,
            ...kioskFont(t, "bold"),
          }}
          // From the solved copy shape — see kioskFeatureRowMetrics. Hard-coding
          // 2 here would let a long name overflow a band that only budgeted one
          // line for it, and the band clips.
          numberOfLines={m.nameLines}
        >
          {item.name}
        </Text>

        {m.showDescription && item.description ? (
          <Text
            style={{
              fontSize: m.descSize,
              lineHeight: m.descLineHeight,
              color: t.textMuted,
              ...kioskFont(t, "regular"),
            }}
            numberOfLines={m.descLines}
          >
            {item.description}
          </Text>
        ) : null}

        {/* Price row. No marginTop — the column's own `gap` is the only
            spacing, which is what the height solve assumes. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: m.priceRowHeight,
            gap: m.pad,
          }}
        >
          <Text
            style={{
              fontSize: m.priceSize,
              letterSpacing: kioskTracking(m.priceSize),
              color: config.textColor,
              fontVariant: ["tabular-nums"],
              ...kioskFont(t, "bold"),
            }}
          >
            ${item.price?.toFixed(2)}
          </Text>

          {isDisabled ? (
            <Text
              style={{
                fontSize: m.descSize,
                color: t.textMuted,
                ...kioskFont(t, "bold"),
              }}
            >
              {kioskStrings.soldOut}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Photo — a rounded square inside the row. The tint is what shows while
          it decodes, so a loading row reads as designed rather than empty. */}
      <View
        style={{
          width: m.imageSize,
          height: m.imageSize,
          borderRadius: m.imageRadius,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.sunken,
        }}
      >
        {resolvedImageSource ? (
          <Image
            source={resolvedImageSource}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            fadeDuration={0}
          />
        ) : (
          <PlaceholderIcon color={t.textFaint} size={m.placeholderSize} />
        )}

        {qtyInCart > 0 ? <InCartBadge qty={qtyInCart} t={t} m={m} /> : null}
      </View>
    </KioskPressable>
  );
};

/**
 * "N in cart" mark on the photo's corner — the same plain count the grid card
 * carries, ticking on each change so a second add is visible from standing
 * distance. A short eased tick, no spring.
 */
function InCartBadge({
  qty,
  t,
  m,
}: {
  qty: number;
  t: KioskTheme;
  m: KioskFeatureRowMetrics;
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
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: m.gap * 1.5,
          right: m.gap * 1.5,
          minWidth: m.badgeTextSize * 1.9,
          paddingHorizontal: m.badgeTextSize * 0.45,
          paddingVertical: m.badgeTextSize * 0.2,
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

export default React.memo(KioskMenuItemFeatureRow, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.price === next.item.price &&
    prev.item.availability === next.item.availability &&
    prev.item.name === next.item.name &&
    prev.item.description === next.item.description &&
    prev.item.image === next.item.image &&
    prev.cardWidth === next.cardWidth &&
    prev.maxCardHeight === next.maxCardHeight &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.textColor === next.config.textColor &&
    prev.config.primaryColor === next.config.primaryColor &&
    prev.onPress === next.onPress
  );
});
