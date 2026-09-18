import type { MenuItemType, ModifierCategory } from "@/lib/types";
import {
  useKioskCartStore,
  type KioskCartModifierGroup,
} from "@/stores/useKioskCartStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMemo, useState } from "react";

/**
 * Shared item-detail logic — no layout. Every template's item-detail view drives
 * its UI from this hook so the modifier rules (required/optional, single vs.
 * multi, min/max enforcement, default pre-selection) and the cart-line build
 * live in exactly one place.
 *
 * Layout is the template's job; this returns state + derived values + actions.
 */
export interface UseItemModifiers {
  /** Resolved modifier groups for the item, in display order. */
  groups: ModifierCategory[];
  /** groupId → set of selected option ids. */
  selected: Record<string, Set<string>>;
  quantity: number;
  setQuantity: (updater: number | ((q: number) => number)) => void;
  /** Toggle an option, applying single/multi + maxSelections rules. */
  toggleOption: (group: ModifierCategory, optionId: string) => void;
  /** Required groups with no selection yet. */
  missingRequired: ModifierCategory[];
  /** True when every required group is satisfied. */
  canAdd: boolean;
  /** Per-unit price of selected modifiers (excludes the base item price). */
  modifiersPrice: number;
  /** Base item price + modifiers, for one unit. */
  unitPrice: number;
  /** unitPrice × quantity. */
  total: number;
  /** Build the cart line (does not add it). Returns null if required unmet. */
  buildLine: () => Parameters<
    ReturnType<typeof useKioskCartStore.getState>["addLine"]
  >[0] | null;
  /** Build + add the line to the cart. No-op if required unmet. Returns success. */
  addToCart: () => boolean;
}

/**
 * Strip 86'd / snoozed options, then drop any group left with nothing to pick.
 *
 * Showing an unavailable option greyed-out is a POS affordance — staff need to
 * know the kitchen is out of it. A customer at a kiosk can only be confused by
 * a choice they aren't allowed to make, so they never see it.
 *
 * Dropping the emptied group matters more than it looks: a **required** group
 * with every option unavailable is a dead end. Nothing is tappable, so its
 * entry in `missingRequired` never clears, `canAdd` stays false, and the CTA
 * reads "Select <group>" forever — the item cannot be ordered and the customer
 * can only back out. Removing the group lets the rest of the item be ordered.
 */
export function selectableModifierGroups(
  groups: ModifierCategory[],
): ModifierCategory[] {
  return groups
    .map((g) => ({
      ...g,
      options: g.options.filter((o) => o.isAvailable !== false),
    }))
    .filter((g) => g.options.length > 0);
}

export function useItemModifiers(item: MenuItemType): UseItemModifiers {
  const getModifierGroupsByIds = useMenuStore((s) => s.getModifierGroupsByIds);
  const addLine = useKioskCartStore((s) => s.addLine);

  const groups = useMemo<ModifierCategory[]>(
    () =>
      selectableModifierGroups(
        getModifierGroupsByIds(item.modifierGroupIds ?? []),
      ),
    [getModifierGroupsByIds, item.modifierGroupIds],
  );

  // Seed selection with each group's default options. `groups` is already
  // filtered, so an 86'd default can't be pre-selected into the cart line.
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of groups) {
      init[g.id] = new Set(g.options.filter((o) => o.isDefault).map((o) => o.id));
    }
    return init;
  });
  const [quantity, setQuantity] = useState(1);

  const toggleOption = (group: ModifierCategory, optionId: string) => {
    setSelected((prev) => {
      const current = new Set(prev[group.id] ?? []);

      if (group.selectionType === "single") {
        // Radio: replace selection.
        return { ...prev, [group.id]: new Set([optionId]) };
      }

      // Multi: toggle, respecting maxSelections.
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        const max = group.maxSelections ?? Infinity;
        if (current.size >= max) return prev; // at cap — ignore
        current.add(optionId);
      }
      return { ...prev, [group.id]: current };
    });
  };

  const missingRequired = useMemo(
    () =>
      groups.filter(
        (g) => g.type === "required" && (selected[g.id]?.size ?? 0) === 0,
      ),
    [groups, selected],
  );
  const canAdd = missingRequired.length === 0;

  const modifiersPrice = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      const ids = selected[g.id];
      if (!ids) continue;
      for (const o of g.options) if (ids.has(o.id)) sum += o.price;
    }
    return sum;
  }, [groups, selected]);

  const unitPrice = item.price + modifiersPrice;
  const total = unitPrice * quantity;

  const buildLine = () => {
    if (!canAdd) return null;
    const modifiers: KioskCartModifierGroup[] = groups
      .map((g) => {
        const ids = selected[g.id];
        const options = g.options
          .filter((o) => ids?.has(o.id))
          .map((o) => ({ id: o.id, name: o.name, price: o.price }));
        return { categoryId: g.id, categoryName: g.name, options };
      })
      .filter((g) => g.options.length > 0);

    return {
      menuItemId: item.id,
      name: item.name,
      image: item.image,
      unitPrice: item.price,
      cashUnitPrice: item.cashPrice ?? item.price,
      quantity,
      modifiers,
    };
  };

  const addToCart = () => {
    const line = buildLine();
    if (!line) return false;
    addLine(line);
    return true;
  };

  return {
    groups,
    selected,
    quantity,
    setQuantity,
    toggleOption,
    missingRequired,
    canAdd,
    modifiersPrice,
    unitPrice,
    total,
    buildLine,
    addToCart,
  };
}
