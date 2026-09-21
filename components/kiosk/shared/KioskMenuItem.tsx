import { KioskAddButton } from "@/components/kiosk/shared/KioskAddButton";
import {
  kioskCardMetrics,
  type KioskCardMetrics,
} from "@/components/kiosk/shared/kioskCardMetrics";
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
 * Kiosk menu card — image on top, then name, description, and a bottom row of
 * price and a quick-add "+".
 *
 * Every size on the card comes from `kioskCardMetrics(cardWidth)`, where
 * `cardWidth` is measured by the parent grid. That's what makes the card
 * responsive to *both* screen size and the manager's items-per-row setting: at
 * 2 columns it reads as a large hero tile, at 4 it tightens up and drops the
 * description rather than shrinking everything into illegibility.
 *
 * Kiosk-native (not the POS MenuItem): themed entirely from `config`, no
 * clock-in wall, no useOrderStore / useModifierSidebarStore coupling. Tapping
 * calls `onPress(item)`; the template decides whether to open item detail or
 * add straight to the kiosk cart.
 */
interface KioskMenuItemProps {
  item: MenuItemType;
  config: KioskConfig;
  /** Measured width of one card, from the parent grid. */
  cardWidth: number;
  /** Height budget for one card, from the parent grid's measured height. */
  maxCardHeight?: number;
  onPress: (item: MenuItemType) => void;
  /** The "+" tap. Omit on surfaces that only navigate (the card body still does). */
  onAdd?: (item: MenuItemType) => void;
}

const KioskMenuItem: React.FC<KioskMenuItemProps> = ({
  item,
  config,
  cardWidth,
  maxCardHeight,
  onPress,
  onAdd,
}) => {
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

  const accent = config.accentColor;
  const surface = useMemo(
    () => kioskCardSurface(config.backgroundColor),
    [config.backgroundColor],
  );

  return (
    <KioskPressable
      disabled={isDisabled}
      pressedScale={0.955}
      onPress={() => onPress(item)}
      style={{
        flex: 1,
        borderRadius: m.radius,
        overflow: "hidden",
        borderWidth: 1,
        backgroundColor: surface,
        borderColor: `${accent}33`,
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      {/* The photo is the flexible block, the copy is not. Whatever the copy
          does not use — a one-line name where two were budgeted for, a missing
          description — the photo takes back, instead of the card holding an
          empty line above the description. `m.imageHeight` is the floor this
          can never go below, and it is what `cardHeight` was summed from. */}
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
              paddingVertical: m.padV * 0.6,
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.55)",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: m.descSize,
                fontWeight: "700",
                letterSpacing: 0.5,
              }}
            >
              {kioskStrings.soldOut}
            </Text>
          </View>
        )}
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
          style={{
            fontSize: m.nameSize,
            lineHeight: m.nameLineHeight,
            fontWeight: "700",
            color: config.textColor,
          }}
          numberOfLines={m.nameLines}
        >
          {item.name}
        </Text>

        {m.showDescription && (
          <Text
            style={{
              fontSize: m.descSize,
              lineHeight: m.descLineHeight,
              color: `${config.textColor}99`,
            }}
            numberOfLines={m.descLines}
          >
            {item.description ?? ""}
          </Text>
        )}

        {/* Still a fixed height: it holds the add button, whose size is a
            touch-target rule rather than something the content decides. It is
            the last block in an intrinsic column, so it sits on the card's
            bottom padding without being pushed there. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: m.gap,
            height: m.priceRowHeight,
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

          {onAdd ? (
            <KioskAddButton
              config={config}
              item={item}
              size={m.addButtonSize}
              iconSize={m.addIconSize}
              disabled={isDisabled}
              onPress={onAdd}
            />
          ) : null}
        </View>
      </View>
    </KioskPressable>
  );
};

/**
 * "N in cart" pill. Springs on every quantity change so adding a second of the
 * same item is visible from standing distance without the customer having to
 * re-read the number.
 */
function InCartBadge({
  qty,
  accent,
  m,
}: {
  qty: number;
  accent: string;
  m: KioskCardMetrics;
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
          top: m.padV * 0.7,
          left: m.padH * 0.6,
          paddingHorizontal: m.padH * 0.5,
          paddingVertical: m.padV * 0.32,
          borderRadius: 999,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
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
    prev.onAdd === next.onAdd &&
    prev.config.accentColor === next.config.accentColor &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.textColor === next.config.textColor &&
    prev.onPress === next.onPress
  );
});
