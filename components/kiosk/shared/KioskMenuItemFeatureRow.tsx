import {
  kioskFeatureRowMetrics,
  type KioskFeatureRowMetrics,
} from "@/components/kiosk/shared/kioskCardMetrics";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  kioskCardSurface,
  kioskFadeEnd,
} from "@/components/kiosk/shared/kioskSurface";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskItemQuantity } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import OptimizedListImage from "@/components/ui/OptimizedListImage";
import { LinearGradient } from "expo-linear-gradient";
import { ShoppingCart, SlidersHorizontal } from "lucide-react-native";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/**
 * Feature row — the one-item-per-row menu card.
 *
 * Selected by setting "Items per row" to 1 (Kiosk Settings → Menu Layout).
 * Built for tall vertical kiosks, where a grid of small cards wastes the panel:
 * one item per row gives each dish a full-width band with editorial-sized type.
 *
 * The photo sits on the **right**, bleeding to the card's edge, and its left
 * side dissolves into the card via a horizontal gradient painted in the card's
 * own surface colour. So there is no visible photo boundary — the image
 * appears to emerge out of the row rather than sit in a box on it. The copy
 * column reserves `textInset` on its right so text always lands on solid
 * surface, never on the crisp half of the photo.
 *
 * Same visual language as the other kiosk cards: `kioskCardSurface` fill, no
 * cast shadow (see the shadows note in docs/features/kiosk), hairline accent
 * border, "Options" affordance, and an in-cart badge that springs on change.
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
  const hasModifiers = !!item.modifierGroupIds?.length;
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

  const accent = config.accentColor;
  // The photo fades into the *card*, not the page — so the fade starts on the
  // card's own surface colour and ends on that same colour at zero alpha.
  const surface = useMemo(
    () => kioskCardSurface(config.backgroundColor),
    [config.backgroundColor],
  );
  const surfaceClear = useMemo(() => kioskFadeEnd(surface), [surface]);

  return (
    <KioskPressable
      disabled={isDisabled}
      pressedScale={0.98}
      onPress={() => onPress(item)}
      style={{
        height: m.height,
        borderRadius: m.radius,
        overflow: "hidden",
        borderWidth: 1,
        backgroundColor: surface,
        borderColor: `${accent}33`,
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      {/* Photo — pinned to the right edge, full bleed top to bottom. The tint
          is what the row shows while the photo decodes, so a loading card
          reads as a designed surface rather than an empty one. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: m.imageWidth,
          backgroundColor: `${accent}10`,
        }}
      >
        {resolvedImageSource ? (
          // expo-image, not RN Image: it cross-dissolves the photo in when it
          // decodes instead of snapping it under a gradient that's already
          // painted, and caches to disk so a scroll back up is instant.
          <OptimizedListImage
            source={resolvedImageSource}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={item.id}
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              // Centre the glyph in the part of the box the fade leaves alone —
              // dead centre would put it under the gradient and wash it out.
              paddingLeft: m.imageWidth * m.fadeStop,
              backgroundColor: `${accent}10`,
            }}
          >
            <PlaceholderIcon
              color={`${config.textColor}55`}
              size={m.placeholderSize}
            />
          </View>
        )}

        {/* The blend: solid card colour on the left, gone by `fadeStop`. */}
        {surfaceClear ? (
          <LinearGradient
            colors={[surface, surface, surfaceClear]}
            locations={[0, m.fadeSolidStop, m.fadeStop]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>

      {/* Copy — sits on solid background, clear of the photo. */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingLeft: m.padH,
          paddingRight: m.textInset,
          paddingVertical: m.padV,
          gap: m.gap,
        }}
      >
        <Text
          style={{
            fontSize: m.nameSize,
            lineHeight: m.nameLineHeight,
            fontWeight: "700",
            color: config.textColor,
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
              color: `${config.textColor}99`,
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
            gap: m.padH * 0.7,
          }}
        >
          <Text
            style={{
              fontSize: m.priceSize,
              fontWeight: "800",
              color: config.textColor,
            }}
          >
            ${item.price?.toFixed(2)}
          </Text>

          {isDisabled ? (
            <Text
              style={{
                fontSize: m.optionsTextSize,
                fontWeight: "700",
                color: `${config.textColor}88`,
              }}
            >
              Unavailable
            </Text>
          ) : hasModifiers ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: m.gap * 0.8,
              }}
            >
              <SlidersHorizontal size={m.optionsIconSize} color={accent} />
              <Text
                style={{
                  fontSize: m.optionsTextSize,
                  fontWeight: "600",
                  color: accent,
                }}
              >
                Options
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* In-cart badge rides the photo's crisp corner, where it reads cleanly
          against the image rather than competing with the copy. */}
      {inCart && <InCartBadge qty={qtyInCart} accent={accent} m={m} />}
    </KioskPressable>
  );
};

function InCartBadge({
  qty,
  accent,
  m,
}: {
  qty: number;
  accent: string;
  m: KioskFeatureRowMetrics;
}) {
  const pop = useSharedValue(1);

  React.useEffect(() => {
    pop.value = 1.28;
    pop.value = withSpring(1, { damping: 9, stiffness: 260, mass: 0.5 });
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
          top: m.padV * 0.7,
          right: m.padH * 0.6,
          paddingHorizontal: m.padH * 0.5,
          paddingVertical: m.padV * 0.28,
          borderRadius: 999,
          flexDirection: "row",
          alignItems: "center",
          gap: m.gap * 0.8,
          backgroundColor: accent,
        },
        style,
      ]}
    >
      <ShoppingCart size={m.badgeIconSize} color="#FFFFFF" strokeWidth={2.75} />
      <Text
        style={{
          color: "#FFFFFF",
          fontWeight: "800",
          fontSize: m.badgeTextSize,
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
    prev.config.accentColor === next.config.accentColor &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.textColor === next.config.textColor &&
    prev.onPress === next.onPress
  );
});
