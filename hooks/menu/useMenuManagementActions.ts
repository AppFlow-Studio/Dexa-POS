/**
 * Every write the menu management screen performs, in one place.
 *
 * Moved out of the old 3,500-line `app/(main)/menu/index.tsx` unchanged in
 * behaviour: same RPCs, same optimistic update, same rollback. What changed is
 * stability — each handler reads the menu store through `getState()` at call
 * time instead of closing over subscribed arrays, so the callbacks keep their
 * identity across store updates and the memoized rows that receive them do not
 * re-render every time any item changes.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useIsSingleLocation } from "@/hooks/pos/useIsSingleLocation";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { applyOrder } from "@/lib/menu/menuManagementIndex";
import type { MenuItemType } from "@/lib/types";
import { toastService } from "@/lib/toastService";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

const showError = (message: string) =>
  toastService.show({ title: "Error", message, type: "error" });

export function useMenuManagementActions() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();
  const storeId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);
  const merchantId = useStoreSettingsStore(
    (s) => s.selectedStore?.merchant_id ?? null,
  );
  const { isSingleLocation, isLoading: isSingleLocationLoading } =
    useIsSingleLocation();

  const triggerSync = useCallback(() => {
    if (!storeId) return Promise.resolve();
    const promises = [
      queryClient.invalidateQueries({ queryKey: ["pos_sync", storeId] }),
    ];
    if (merchantId) {
      promises.push(
        queryClient.invalidateQueries({
          queryKey: ["standalone_sync", merchantId, storeId],
        }),
      );
    }
    return Promise.all(promises).then(() => undefined);
  }, [queryClient, storeId, merchantId]);

  // Full-form editability (name/details): a global entity is only editable by a
  // single-location merchant (their menu IS the global core). Multi-location
  // merchants get the read-only wall for global entities.
  const isEntityEditable = useCallback(
    (entityLocationId: string | null | undefined) => {
      if (!storeId) return false;
      if (entityLocationId) return entityLocationId === storeId;
      return isSingleLocation;
    },
    [storeId, isSingleLocation],
  );

  // Price + availability CAN be adjusted on global items even by multi-location
  // merchants, because those writes go through per-location overrides (never the
  // global core). Local items must still match the current store.
  const canEditAvailabilityAndPrice = useCallback(
    (entityLocationId: string | null | undefined) => {
      if (!storeId) return false;
      if (entityLocationId) return entityLocationId === storeId;
      return true;
    },
    [storeId],
  );

  const toggleMenuActive = useCallback(
    async (menuId: string) => {
      const store = useMenuStore.getState();
      const menu = store.menus.find((m) => m.id === menuId);
      if (!menu) return;
      const nextIsActive = !menu.isActive;

      store.toggleMenuActive(menuId);
      const { error } = await MenuService.updateMenu(supabase, menuId, {
        isActive: nextIsActive,
      });
      if (error) {
        useMenuStore.getState().toggleMenuActive(menuId);
        showError("Failed to update menu status");
      }
    },
    [supabase],
  );

  const toggleCategoryActive = useCallback(
    async (categoryId: string) => {
      const store = useMenuStore.getState();
      const category = store.categories.find((c) => c.id === categoryId);
      if (!category) return;
      const nextIsActive = !category.isActive;

      store.toggleCategoryActive(categoryId);
      const { error } = await MenuService.updateCategory(supabase, categoryId, {
        isActive: nextIsActive,
      });
      if (error) {
        useMenuStore.getState().toggleCategoryActive(categoryId);
        showError("Failed to update category status");
      }
    },
    [supabase],
  );

  const toggleItemAvailability = useCallback(
    async (itemId: string) => {
      const store = useMenuStore.getState();
      const item = store.menuItems.find((i) => i.id === itemId);
      if (!item) return;
      const nextAvailability = item.availability === false;

      // "Owned" = the item is genuinely location-local to this store, so its own
      // menu_items row IS this location's copy and flipping its availability
      // boolean directly is correct.
      //
      // A GLOBAL item must NOT mutate the shared core — route the toggle through
      // the per-location 86/snooze override (infinity = hidden, null =
      // available). This INCLUDES single-location merchants: their availability
      // lives on the per-location override too (that is where the website's
      // toggle + 86 write), so a store's is_available can always be cleared from
      // either app. Writing via set_item_snooze_v1 (SECURITY DEFINER) also keeps
      // us on the POS's RLS-safe write path.
      const isOwned = !!storeId && item.location_id === storeId;

      store.toggleItemAvailability(itemId);

      if (isOwned) {
        const { error } = await MenuService.updateMenuItem(supabase, itemId, {
          availability: nextAvailability,
        });
        if (error) {
          useMenuStore.getState().toggleItemAvailability(itemId);
          showError("Failed to update item availability");
        }
        return;
      }

      if (!storeId) {
        useMenuStore.getState().toggleItemAvailability(itemId);
        return;
      }

      const { error } = await MenuService.setItemSnooze(supabase, {
        locationId: storeId,
        menuItemId: itemId,
        // Hiding -> 86 until manually restored; showing -> clear the 86.
        snoozedUntil: nextAvailability ? null : "infinity",
      });
      if (error) {
        useMenuStore.getState().toggleItemAvailability(itemId);
        showError("Failed to update item availability");
      } else {
        void triggerSync();
      }
    },
    [supabase, storeId, triggerSync],
  );

  /** Device-local, in-memory: hides a category inside one menu on this tablet. */
  const toggleCategoryInMenuOnDevice = useCallback(
    (menuId: string, categoryId: string) => {
      useMenuStore.getState().toggleMenuCategoryActive(menuId, categoryId);
    },
    [],
  );

  /**
   * Takes the full new order as ids, not a (from, to) pair. The screen lists
   * menus sorted by displayOrder then name, which need not match the store
   * array's order, so an index from the screen can point at a different menu
   * in the store.
   */
  const reorderMenus = useCallback(
    async (orderedIds: string[]) => {
      if (!storeId) {
        showError("Select a store before reordering menus");
        return;
      }
      const { menus } = useMenuStore.getState();
      useMenuStore.setState({
        menus: applyOrder(menus, orderedIds).map((menu, idx) => ({
          ...menu,
          displayOrder: idx,
        })),
      });

      // Persist the effective order the sync RPC reads for this location.
      const menuOrders = useMenuStore.getState().menus.map((menu, idx) => ({
        menuId: menu.id,
        displayOrder: idx,
      }));
      try {
        const { error } = await MenuService.reorderLocationMenus(
          supabase,
          storeId,
          menuOrders,
        );
        if (error) {
          showError("Failed to save menu order");
          void triggerSync();
        }
      } catch {
        void triggerSync();
      }
    },
    [supabase, storeId, triggerSync],
  );

  const reorderMenuCategories = useCallback(
    async (menuId: string, fromIndex: number, toIndex: number) => {
      if (!storeId) return;
      const store = useMenuStore.getState();
      const menu = store.menus.find((m) => m.id === menuId);
      if (!menu?.categories) return;

      const nextCategories = [...menu.categories];
      const [moved] = nextCategories.splice(fromIndex, 1);
      if (!moved) return;
      nextCategories.splice(toIndex, 0, moved);
      store.updateMenu(menuId, { categories: nextCategories });

      const { error } = await MenuService.reorderMenuCategories(
        supabase,
        menuId,
        storeId,
        nextCategories.map((c, idx) => ({
          category_id: c.id,
          display_order: idx,
        })),
      );
      if (error) {
        showError("Failed to save category order");
        void triggerSync();
      }
    },
    [supabase, storeId, triggerSync],
  );

  const reorderCategoryItems = useCallback(
    async (categoryId: string, fromIndex: number, toIndex: number) => {
      if (!storeId) return;
      useMenuStore.getState().reorderCategoryItems(categoryId, fromIndex, toIndex);

      // Read the reordered items from the UPDATED tree (getItemsInCategory
      // ignores order).
      let reordered: MenuItemType[] | undefined;
      for (const menu of useMenuStore.getState().menus) {
        const cat = menu.categories.find((c) => c.id === categoryId);
        if (cat?.items) {
          reordered = cat.items;
          break;
        }
      }
      if (!reordered?.length) return;

      const { error } = await MenuService.reorderCategoryItems(
        supabase,
        categoryId,
        storeId,
        reordered.map((item, idx) => ({
          menuItemId: item.id,
          displayOrder: idx,
        })),
      );
      if (error) {
        showError("Failed to save item order");
        void triggerSync();
      }
    },
    [supabase, storeId, triggerSync],
  );

  /** Full new order as ids — see `reorderMenus` for why not indices. */
  const reorderModifierGroups = useCallback(
    async (orderedIds: string[]) => {
      if (!merchantId) {
        showError("Select a store before reordering modifiers");
        return;
      }
      const groups = applyOrder(
        useMenuStore.getState().modifierGroups,
        orderedIds,
      ).map((group, index) => ({ ...group, displayOrder: index }));
      useMenuStore.setState({
        modifierGroups: groups,
        modifierGroupsById: Object.fromEntries(groups.map((g) => [g.id, g])),
      });

      const { error } = await MenuService.reorderModifierGroups(
        supabase,
        merchantId,
        useMenuStore.getState().modifierGroups.map((group, index) => ({
          modifierGroupId: group.id,
          displayOrder: index,
        })),
      );
      if (error) {
        showError("Failed to save modifier order");
        void triggerSync();
      }
    },
    [supabase, merchantId, triggerSync],
  );

  /** Resolves true when the item is gone from the backend and the store. */
  const deleteItem = useCallback(
    async (itemId: string): Promise<boolean> => {
      const { success, error } = await MenuService.deleteMenuItem(
        supabase,
        itemId,
      );
      if (!success) {
        showError(error?.message || "Failed to delete item");
        return false;
      }
      useMenuStore.getState().deleteMenuItem(itemId);
      return true;
    },
    [supabase],
  );

  return useMemo(
    () => ({
      storeId,
      isSingleLocation,
      isSingleLocationLoading,
      triggerSync,
      isEntityEditable,
      canEditAvailabilityAndPrice,
      toggleMenuActive,
      toggleCategoryActive,
      toggleItemAvailability,
      toggleCategoryInMenuOnDevice,
      reorderMenus,
      reorderMenuCategories,
      reorderCategoryItems,
      reorderModifierGroups,
      deleteItem,
    }),
    [
      storeId,
      isSingleLocation,
      isSingleLocationLoading,
      triggerSync,
      isEntityEditable,
      canEditAvailabilityAndPrice,
      toggleMenuActive,
      toggleCategoryActive,
      toggleItemAvailability,
      toggleCategoryInMenuOnDevice,
      reorderMenus,
      reorderMenuCategories,
      reorderCategoryItems,
      reorderModifierGroups,
      deleteItem,
    ],
  );
}

export type MenuManagementActions = ReturnType<typeof useMenuManagementActions>;
