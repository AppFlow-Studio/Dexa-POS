import {
  kioskCardMetrics,
  type KioskCardMetrics,
} from "@/components/kiosk/shared/kioskCardMetrics";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskCardSurface } from "@/components/kiosk/shared/kioskSurface";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskItemQuantity } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart, SlidersHorizontal } from "lucide-react-native";
import React, { useMemo } from "react";
import { Image, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/**
 * Kiosk menu card — image on top, then name, description, price and (when the
 * item is customizable) an "Options" pill.
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
}

const KioskMenuItem: React.FC<KioskMenuItemProps> = ({
  item,
  config,
  cardWidth,
  maxCardHeight,
  onPress,
}) => {
  const m = useMemo(
    () => kioskCardMetrics(cardWidth, maxCardHeight),
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
      <View style={{ height: m.imageHeight, width: "100%" }}>
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
              Unavailable
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          flex: 1,
          paddingHorizontal: m.padH,
          paddingTop: m.padV,
          paddingBottom: m.padV * 1.2,
          gap: m.gap,
        }}
      >
        <Text
          style={{
            fontSize: m.nameSize,
            lineHeight: m.nameLineHeight,
            height: m.nameBlockHeight,
            fontWeight: "700",
            color: config.textColor,
          }}
          numberOfLines={2}
        >
          {item.name}
        </Text>

        {m.showDescription && (
          <Text
            style={{
              fontSize: m.descSize,
              lineHeight: m.descLineHeight,
              height: m.descBlockHeight,
              color: `${config.textColor}99`,
            }}
            numberOfLines={m.descLines}
          >
            {item.description ?? ""}
          </Text>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: m.gap,
            marginTop: "auto",
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

          {hasModifiers && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: m.gap * 0.6,
              }}
            >
              <SlidersHorizontal size={m.optionsIconSize} color={accent} />
              {m.showOptionsLabel && (
                <Text
                  style={{
                    fontSize: m.optionsTextSize,
                    fontWeight: "600",
                    color: accent,
                  }}
                >
                  Options
                </Text>
              )}
            </View>
          )}
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
    prev.config.accentColor === next.config.accentColor &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.textColor === next.config.textColor &&
    prev.onPress === next.onPress
  );
});
