import {
  kioskRowMetrics,
  type KioskRowMetrics,
} from "@/components/kiosk/shared/kioskCardMetrics";
import {
  kioskFont,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
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
import { ShoppingCart } from "lucide-react-native";
import React, { useMemo } from "react";
import { Image, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/**
 * Row variant of the menu card — square image left, copy right.
 *
 * `KioskItemGrid` switches to this automatically when a cell is much wider
 * than its height budget (see `shouldUseRowLayout`), which in practice is the
 * 2-column landscape case. A top-image card there would have to letterbox its
 * photo to roughly 2.7:1 to fit the row height, and the result reads as a
 * banner rather than a product. Turning the card on its side keeps the photo
 * square, gives the copy a sensible column, and fits ~3.5 rows on screen
 * instead of ~1.9.
 *
 * Same visual language as KioskMenuItem: no cast shadow (see the shadows note
 * in docs/features/kiosk) and an in-cart badge that springs on change.
 */
interface KioskMenuItemRowProps {
  item: MenuItemType;
  config: KioskConfig;
  cardWidth: number;
  maxCardHeight: number;
  onPress: (item: MenuItemType) => void;
}

const KioskMenuItemRow: React.FC<KioskMenuItemRowProps> = ({
  item,
  config,
  cardWidth,
  maxCardHeight,
  onPress,
}) => {
  const m = useMemo(
    () => kioskRowMetrics(cardWidth, maxCardHeight),
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

  const t = useKioskTheme(config);
  const accent = config.accentColor;
  const surface = useMemo(
    () => kioskCardSurface(config.backgroundColor),
    [config.backgroundColor],
  );

  return (
    <KioskPressable
      disabled={isDisabled}
      pressedScale={0.97}
      onPress={() => onPress(item)}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: m.pad,
        padding: m.pad,
        borderRadius: m.radius,
        backgroundColor: surface,
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: m.imageSize,
          height: m.imageSize,
          borderRadius: m.imageRadius,
          overflow: "hidden",
        }}
      >
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
              backgroundColor: `${accent}10`,
            }}
          >
            <PlaceholderIcon
              color={`${config.textColor}55`}
              size={m.placeholderSize}
            />
          </View>
        )}

        {inCart && <InCartBadge qty={qtyInCart} accent={accent} m={m} />}

        {isDisabled && (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingVertical: m.gap,
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.55)",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: m.descSize,
                fontWeight: "700",
              }}
            >
              {kioskStrings.soldOut}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, gap: m.gap }}>
        <Text
          style={{
            fontSize: m.nameSize,
            lineHeight: m.nameLineHeight,
            letterSpacing: kioskTracking(m.nameSize),
            color: config.textColor,
            ...kioskFont(t, "bold"),
          }}
          numberOfLines={2}
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

        {/* Fixed height — `rowHeight` sums the copy column's blocks, and an
            intrinsically-sized price row would make that sum a guess. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: m.pad,
            height: m.priceRowHeight,
            marginTop: m.gap,
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
        </View>
      </View>
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
  m: KioskRowMetrics;
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
      style={[
        {
          position: "absolute",
          top: m.gap,
          left: m.gap,
          paddingHorizontal: m.gap,
          paddingVertical: m.gap * 0.5,
          borderRadius: kioskRadius.xs,
          flexDirection: "row",
          alignItems: "center",
          gap: m.gap * 0.6,
          backgroundColor: accent,
        },
        style,
      ]}
    >
      <ShoppingCart
        size={m.badgeIconSize}
        color="#FFFFFF"
        strokeWidth={2.75}
      />
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

export default React.memo(KioskMenuItemRow, (prev, next) => {
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
