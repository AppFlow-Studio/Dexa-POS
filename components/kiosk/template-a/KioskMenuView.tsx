import { KioskCategoryRail, type CategorySection } from "@/components/kiosk/shared/KioskCategoryRail";
import KioskMenuItem from "@/components/kiosk/shared/KioskMenuItem";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import {
  hasOrderableItem,
  useModifierGroupResolver,
  useOrderableItems,
} from "@/components/kiosk/shared/kioskItemAvailability";
import { KioskItemGrid } from "@/components/kiosk/shared/KioskItemGrid";
import { kioskRailWidth } from "@/components/kiosk/shared/kioskLayout";
import { KioskNoMenusState } from "@/components/kiosk/shared/KioskNoMenusState";
import { KioskSearchBar } from "@/components/kiosk/shared/KioskSearchBar";
import { KioskSearchOverlay } from "@/components/kiosk/shared/KioskSearchOverlay";
import {
  useIsStationMenuScopeEmpty,
  useVisibleMenus,
} from "@/hooks/menu/useVisibleMenus";
import type { MenuItemType } from "@/lib/types";
import {
  resolveKioskColumns,
  useKioskDeviceSettingsStore,
} from "@/stores/useKioskDeviceSettingsStore";
import { useMenuStore } from "@/stores/useMenuStore";
import type { KioskConfig } from "@/types/kiosk";
import { useMemo, useState } from "react";
import { View } from "react-native";

/**
 * Template A menu view — a search bar over a two-pane split:
 *   left rail  = categories grouped under their menu name (menu = section header)
 *   right pane = item grid for the selected category
 *
 * The search bar spans both panes and opens KioskSearchOverlay over the whole
 * view — searching looks across every available menu, not the selected category.
 *
 * Split ratio follows orientation (config.orientation):
 *   horizontal → 1/4 left · 3/4 right, grid 4 columns
 *   vertical   → 1/3 left · 2/3 right, grid 3 columns
 *
 * Reads the menu tree from useMenuStore (menus → categories → items), filtered
 * to what's available now. Tapping an item hands it up via onSelectItem.
 */
export function KioskMenuView({
  config,
  onSelectItem,
}: {
  config: KioskConfig;
  onSelectItem: (item: MenuItemType) => void;
}) {
  // Kiosk channel + per-station scope are applied by the shared selector.
  const menus = useVisibleMenus();
  const scopedToNothing = useIsStationMenuScopeEmpty();
  const resolveGroups = useModifierGroupResolver();
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);

  const isVertical = config.orientation === "vertical";
  // Column count: manager device setting wins; "auto" falls back to the
  // orientation default (3 vertical / 4 horizontal).
  const columnsPref = useKioskDeviceSettingsStore((st) => st.menuColumns);
  const numColumns = resolveKioskColumns(columnsPref, isVertical ? 3 : 4);

  // Build one section per available menu, listing its available categories.
  const sections = useMemo<CategorySection[]>(() => {
    return menus
      .filter((m) => isMenuAvailableNow(m.id))
      .map((m) => ({
        menuId: m.id,
        title: m.name,
        data: m.categories.filter(
          (c) =>
            c.isActive &&
            isCategoryAvailableNow(c.name) &&
            hasOrderableItem(c.items, resolveGroups),
        ),
      }))
      .filter((s) => s.data.length > 0);
  }, [menus, isMenuAvailableNow, isCategoryAvailableNow, resolveGroups]);

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

  const [searchOpen, setSearchOpen] = useState(false);

  // Scoped to a selection that leaves nothing: fail closed to the empty state,
  // never to the full menu. After every hook, so the hook order is stable.
  if (scopedToNothing) return <KioskNoMenusState config={config} />;

  return (
    <View className="flex-1">
      {/* Search spans the rail as well as the grid — it looks across the whole
          menu, not the category that happens to be selected. */}
      <KioskSearchBar config={config} onPress={() => setSearchOpen(true)} />

      <View className="flex-1 flex-row">
        {/* Left rail — categories grouped by menu */}
        <View style={{ width: kioskRailWidth(isVertical, numColumns) }}>
          <KioskCategoryRail
            config={config}
            sections={sections}
            resolvedKey={resolvedKey}
            onSelect={setActiveKey}
          />
        </View>

        {/* Right pane - item grid */}
        <View className="flex-1">
          <KioskItemGrid
            config={config}
            items={items}
            numColumns={numColumns}
            resetKey={resolvedKey}
            onSelectItem={onSelectItem}
          />
        </View>
      </View>

      {searchOpen ? (
        <KioskSearchOverlay
          config={config}
          onClose={() => setSearchOpen(false)}
          onSelectItem={(item) => {
            setSearchOpen(false);
            onSelectItem(item);
          }}
        />
      ) : null}
    </View>
  );
}
