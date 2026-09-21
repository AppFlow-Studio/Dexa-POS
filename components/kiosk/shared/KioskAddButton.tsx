import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import type { KioskConfig } from "@/types/kiosk";
import type { MenuItemType } from "@/lib/types";
import { Plus } from "lucide-react-native";
import React from "react";

/** Smallest area a finger should have to hit, however small the circle is. */
const MIN_TOUCH_TARGET = 44;

/**
 * The "+" on a menu card.
 *
 * Present on every card, whatever the item is — a customer should never have
 * to work out which items can be added from the grid and which need a detour
 * through a detail screen. What it *does* differs (an item with modifier
 * groups opens the popup, one without goes straight into the basket), but that
 * branch belongs to the caller; from the grid it is one affordance with one
 * meaning: this goes in my order.
 *
 * Sized as a share of the card, so it stays in proportion whether the grid is
 * two columns or four. On the smaller cards that leaves a circle under the
 * 44dp touch minimum, so the pressable is padded out with `hitSlop` — the
 * area a finger has to find is always at least 44dp square, whatever the
 * drawn circle measures.
 */
export const KioskAddButton = React.memo(function KioskAddButton({
  config,
  item,
  size,
  iconSize,
  disabled,
  onPress,
}: {
  config: KioskConfig;
  item: MenuItemType;
  size: number;
  iconSize: number;
  disabled?: boolean;
  onPress: (item: MenuItemType) => void;
}) {
  // Half the shortfall on each edge, so the target is centred on the circle.
  const slop = Math.max(0, Math.round((MIN_TOUCH_TARGET - size) / 2));

  return (
    <KioskPressable
      disabled={disabled}
      pressedScale={0.86}
      hitSlop={slop}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={kioskStrings.addItem(item.name)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: disabled
          ? `${config.textColor}1A`
          : config.primaryColor,
      }}
    >
      <Plus
        size={iconSize}
        color={disabled ? `${config.textColor}66` : "#FFFFFF"}
        strokeWidth={2.75}
      />
    </KioskPressable>
  );
});
