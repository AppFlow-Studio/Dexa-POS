import {
  useModifierGroupResolver,
  type ResolveModifierGroups,
} from "@/components/kiosk/shared/kioskItemAvailability";
import {
  buildKioskCartLine,
  selectableModifierGroups,
} from "@/components/kiosk/shared/useItemModifiers";
import type { MenuItemType } from "@/lib/types";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useCallback } from "react";

/**
 * Does this item have anything left for the customer to choose?
 *
 * The one place the rule lives, so the grid's "+" and anything else that has
 * to branch on it can never drift apart. It is deliberately not
 * `modifierGroupIds.length > 0`: a group whose every option is 86'd has
 * nothing to pick, so sending the customer to a sheet showing an empty group
 * would be a dead end. `selectableModifierGroups` is the same filter the
 * detail sheet applies, so what we predict is what they would actually see.
 */
export function kioskItemHasModifierGroups(
  item: MenuItemType,
  resolveGroups: ResolveModifierGroups,
): boolean {
  return (
    selectableModifierGroups(resolveGroups(item.modifierGroupIds ?? [])).length >
    0
  );
}

/**
 * What the "+" on a menu card does.
 *
 * Two outcomes, one affordance: an item with choices left to make opens the
 * detail popup and nothing enters the cart until its required groups are
 * satisfied; an item with none goes straight in at quantity 1. The customer is
 * never asked to work out in advance which kind they are looking at.
 *
 * No cart maths here — the line is assembled by `buildKioskCartLine` and
 * totalled by the cart store, exactly as the detail sheet's Add does.
 */
export function useKioskItemAdd(
  onOpenDetail: (item: MenuItemType) => void,
): (item: MenuItemType) => void {
  const resolveGroups = useModifierGroupResolver();
  const addLine = useKioskCartStore((s) => s.addLine);

  return useCallback(
    (item: MenuItemType) => {
      if (kioskItemHasModifierGroups(item, resolveGroups)) {
        onOpenDetail(item);
        return;
      }
      addLine(buildKioskCartLine(item, [], 1));
    },
    [resolveGroups, addLine, onOpenDetail],
  );
}
