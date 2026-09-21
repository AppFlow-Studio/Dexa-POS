import type { MenuItemType, ModifierCategory } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import type { ModifierSelection } from "@/stores/useModifierSelectionStore";
import { computeAddModeSelections } from "@/stores/useModifierSidebarStore";
import { useCallback, useMemo, useState } from "react";
import { unitPriceWithOptions, unsatisfiedRequired, type ItemDraft } from "../../lib/cartItem";

export interface OptionsDraft extends ItemDraft {
  total: number;
  /** Required group ids still empty after a failed Add; cleared on the next pick. */
  errors: string[];
  setQuantity: (n: number) => void;
  setToGo: (toGo: boolean) => void;
  toggle: (group: ModifierCategory, optionId: string) => void;
  /** Null when a required group is empty (and `errors` is set). */
  commit: () => ItemDraft | null;
}

/**
 * Screen 4's state for one menu item: quantity, to-go, and a selection map in
 * the register's shape, seeded by the same auto-select rules the register
 * applies. Single groups replace, multiple groups toggle up to `maxSelections`.
 */
export function useOptionsDraft(target: { item: MenuItemType; categoryId: string | null; menuId: string | null }): OptionsDraft {
  const { item, categoryId, menuId } = target;
  const groups = useMemo(
    () => (item.modifierGroupIds ? useMenuStore.getState().getModifierGroupsByIds(item.modifierGroupIds) : []),
    [item.modifierGroupIds],
  );
  const [selections, setSelections] = useState<ModifierSelection>(() => computeAddModeSelections(groups));
  const [quantity, setQuantity] = useState(1);
  const [isToGo, setToGo] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const toggle = useCallback((group: ModifierCategory, optionId: string) => {
    setErrors([]);
    setSelections((prev) => {
      const current = prev[group.id] ?? {};
      const on = current[optionId] === true;
      let next: ModifierSelection[string];
      if (group.selectionType === "single") {
        next = on ? {} : { [optionId]: true };
      } else {
        next = { ...current };
        if (on) delete next[optionId];
        else {
          const chosen = Object.values(next).filter(Boolean).length;
          if (group.maxSelections && chosen >= group.maxSelections) return prev;
          next[optionId] = true;
        }
      }
      return { ...prev, [group.id]: next };
    });
  }, []);

  const draft: ItemDraft = { item, categoryId, menuId, quantity, isToGo, groups, selections };
  const total = unitPriceWithOptions(item.price, groups, selections) * quantity;

  const commit = useCallback((): ItemDraft | null => {
    const missing = unsatisfiedRequired(groups, selections);
    if (missing.length) {
      setErrors(missing);
      return null;
    }
    return { item, categoryId, menuId, quantity, isToGo, groups, selections };
  }, [item, categoryId, menuId, quantity, isToGo, groups, selections]);

  return {
    ...draft,
    total,
    errors,
    setQuantity: (n) => setQuantity(Math.max(1, Math.min(99, n))),
    setToGo,
    toggle,
    commit,
  };
}
