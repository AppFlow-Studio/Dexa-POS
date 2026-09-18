import { isItemOnChannel } from "@/lib/menu/itemChannelVisibility";
import type { MenuItemType, ModifierCategory } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMemo } from "react";

export type ResolveModifierGroups = (ids: string[]) => ModifierCategory[];

/**
 * Should the kiosk offer this item right now?
 *
 * Three gates, in cost order:
 *
 * 1. **Sales channel.** The merchant can untick Kiosk on an item in the
 *    dashboard; an item not sold on this channel is not the kiosk's to show,
 *    whatever the kitchen could make. Checked here rather than at each call
 *    site so the rail, the grid and search can never disagree about it.
 * 2. The item's own 86 flag.
 * 3. **Required** modifier groups with no available options left — a burger
 *    whose every bun is 86'd cannot be built, whatever the item flag says.
 *    Both option-level and whole-group snoozes land as `isAvailable: false` on
 *    the options (see `snoozeModifierOption` / `snoozeModifierGroup` in
 *    useMenuStore), so one predicate covers both.
 *
 * Fails **open** throughout: an item with no channel data, or whose groups
 * can't be resolved (empty lookup, menu still hydrating), stays visible. Hiding
 * a sellable item because of a data-loading gap is far worse than showing one
 * that later turns out to be unavailable — the detail screen catches that case
 * anyway.
 */
export function isItemOrderable(
  item: MenuItemType,
  resolveGroups: ResolveModifierGroups,
): boolean {
  if (!isItemOnChannel(item, "kiosk")) return false;
  if (item.availability === false) return false;

  const groupIds = item.modifierGroupIds ?? [];
  if (groupIds.length === 0) return true;

  return resolveGroups(groupIds).every(
    (g) =>
      g.type !== "required" || g.options.some((o) => o.isAvailable !== false),
  );
}

/** The menu store's group lookup, for callers testing many items at once. */
export function useModifierGroupResolver(): ResolveModifierGroups {
  return useMenuStore((s) => s.getModifierGroupsByIds);
}

/** Does this category have anything left that can actually be ordered? */
export function hasOrderableItem(
  items: MenuItemType[] | undefined,
  resolveGroups: ResolveModifierGroups,
): boolean {
  return (items ?? []).some((i) => isItemOrderable(i, resolveGroups));
}

/**
 * Filter a category's items down to what the kitchen can actually produce.
 * Pass the store's array straight through (`activeCategory?.items`) — its
 * reference is stable, so the memo only recomputes on a real menu change.
 */
export function useOrderableItems(
  items: MenuItemType[] | undefined,
): MenuItemType[] {
  const getModifierGroupsByIds = useMenuStore((s) => s.getModifierGroupsByIds);
  return useMemo(
    () => (items ?? []).filter((i) => isItemOrderable(i, getModifierGroupsByIds)),
    [items, getModifierGroupsByIds],
  );
}
