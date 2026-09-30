import { KioskCategoryMenuBody } from "@/components/kiosk/shared/KioskCategoryMenuBody";
import type { CategorySection } from "@/components/kiosk/shared/KioskCategoryRail";
import {
  hasOrderableItem,
  useModifierGroupResolver,
  useOrderableItems,
} from "@/components/kiosk/shared/kioskItemAvailability";
import { KioskNoMenusState } from "@/components/kiosk/shared/KioskNoMenusState";
import type { KioskMenuSearchState } from "@/components/kiosk/shared/useKioskMenuSearchState";
import { useKioskScheduledMenus } from "@/components/kiosk/shared/useKioskScheduledMenus";
import { useIsStationMenuScopeEmpty } from "@/hooks/menu/useVisibleMenus";
import type { MenuItemType } from "@/lib/types";
import type { KioskItemSource } from "@/stores/useKioskCartStore";
import {
  resolveKioskColumns,
  useKioskDeviceSettingsStore,
} from "@/stores/useKioskDeviceSettingsStore";
import type { KioskConfig } from "@/types/kiosk";
import { useCallback, useMemo, useState } from "react";

/**
 * Template A menu view — a two-pane split, starting flush under the header:
 *   left rail  = categories grouped under their menu name (menu = section header)
 *   right pane = item grid for the selected category
 *
 * Split ratio follows orientation (config.orientation):
 *   horizontal → 1/4 left · 3/4 right, grid 4 columns
 *   vertical   → 1/3 left · 2/3 right, grid 3 columns
 * On a portrait phone the rail becomes a horizontal strip over a full-width
 * grid (see KioskCategoryMenuBody).
 *
 * Nothing sits between the header and the content. Categories are in the rail
 * and search lives in the header, so the rail and the grid both begin at the
 * top of the panel — the full-width search bar that used to lead this screen
 * pushed both down by its whole height for a field that is empty almost all of
 * the time, and on a short landscape panel that cost the second row of tiles.
 *
 * Reads the menu tree from useMenuStore (menus → categories → items), filtered
 * to what's available now. Tapping a tile hands the item up via onSelectItem;
 * the tile's "+" adds it outright when there is nothing to choose.
 */
export function KioskMenuView({
  config,
  onSelectItem,
  search,
}: {
  config: KioskConfig;
  /** `source` is the menu + category the item was picked from. */
  onSelectItem: (item: MenuItemType, source?: KioskItemSource) => void;
  /** Owned by the template shell — the header draws the field, this draws the results. */
  search: KioskMenuSearchState;
}) {
  // Kiosk channel, per-station scope and menu/category schedules are applied
  // by the shared selectors.
  const { menus, closedBySchedule } = useKioskScheduledMenus();
  const scopedToNothing = useIsStationMenuScopeEmpty();
  const resolveGroups = useModifierGroupResolver();

  const isVertical = config.orientation === "vertical";
  // Column count: manager device setting wins; "auto" falls back to the
  // orientation default (3 vertical / 4 horizontal).
  const columnsPref = useKioskDeviceSettingsStore((st) => st.menuColumns);
  const numColumns = resolveKioskColumns(columnsPref, isVertical ? 3 : 4);

  // Build one section per available menu, listing its available categories.
  const sections = useMemo<CategorySection[]>(() => {
    return menus
      .map((m) => ({
        menuId: m.id,
        title: m.name,
        data: m.categories.filter((c) =>
          hasOrderableItem(c.items, resolveGroups),
        ),
      }))
      .filter((s) => s.data.length > 0);
  }, [menus, resolveGroups]);

  // Selection keyed by menuId+categoryId so the same category name in two menus
  // stays distinct.
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { activeCategory, resolvedKey } = useMemo(() => {
    const all = sections.flatMap((s) =>
      s.data.map((c) => ({ key: `${s.menuId}:${c.id}`, category: c })),
    );
    const found = all.find((e) => e.key === activeKey) ?? all[0];
    return {
      activeCategory: found?.category,
      resolvedKey: found?.key ?? null,
    };
  }, [sections, activeKey]);

  const items = useOrderableItems(activeCategory?.items);

  // Picking a category is also a way out of a search: the results layer covers
  // the grid, so leaving it up after a switch would show the customer the same
  // list and no sign that anything happened.
  const handleSelectCategory = useCallback(
    (key: string) => {
      search.close();
      setActiveKey(key);
    },
    [search],
  );

  // Scoped to a selection that leaves nothing: fail closed to the empty state,
  // never to the full menu. After every hook, so the hook order is stable.
  if (scopedToNothing) return <KioskNoMenusState config={config} />;
  if (closedBySchedule) {
    return <KioskNoMenusState config={config} reason="schedule" />;
  }

  return (
    <KioskCategoryMenuBody
      config={config}
      sections={sections}
      resolvedKey={resolvedKey}
      onSelectCategory={handleSelectCategory}
      items={items}
      numColumns={numColumns}
      search={search}
      onSelectItem={onSelectItem}
    />
  );
}
