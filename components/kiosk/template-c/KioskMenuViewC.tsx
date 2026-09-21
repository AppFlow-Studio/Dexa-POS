import { KioskCategoryPillBar, type CategoryPill } from "@/components/kiosk/shared/KioskCategoryPillBar";
import {
  hasOrderableItem,
  useModifierGroupResolver,
  useOrderableItems,
} from "@/components/kiosk/shared/kioskItemAvailability";
import { KioskItemGrid } from "@/components/kiosk/shared/KioskItemGrid";
import { kioskBannerHeight } from "@/components/kiosk/shared/kioskLayout";
import { KioskNoMenusState } from "@/components/kiosk/shared/KioskNoMenusState";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { KioskSearchResults } from "@/components/kiosk/shared/KioskSearchResults";
import { useKioskItemAdd } from "@/components/kiosk/shared/useKioskItemAdd";
import type { KioskMenuSearchState } from "@/components/kiosk/shared/useKioskMenuSearchState";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import {
  useIsStationMenuScopeEmpty,
  useVisibleMenus,
} from "@/hooks/menu/useVisibleMenus";
import type { Category, MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import {
  resolveKioskColumns,
  useKioskDeviceSettingsStore,
} from "@/stores/useKioskDeviceSettingsStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { kioskOrderBannerImages, type KioskConfig } from "@/types/kiosk";
import { useCallback, useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";

/**
 * Template C menu view — media banner (same carousel as Template B), then a
 * horizontal scrollable pill bar of categories (acting as tabs, not a
 * jump-scroll nav), then a single-category item grid — same performance
 * model as Templates A/B (only the active category's items are ever
 * mounted), just without a category sidebar: the pill bar takes over
 * category switching.
 *
 * In vertical orientation the banner sits on top, full width, same as
 * Template B. In horizontal orientation the screen is too short for a tall
 * top banner, so the carousel instead becomes a left-hand sidebar (media
 * fills the vertical strip) with the pill bar + grid stacked to its right.
 *
 * The pill strip is the only chrome above the grid — search lives in the
 * header. Two rows before the first tile is what pushed the second tile row
 * under the fold on a short landscape panel.
 */
export function KioskMenuViewC({
  config,
  onSelectItem,
  search,
}: {
  config: KioskConfig;
  onSelectItem: (item: MenuItemType) => void;
  /** Owned by the template shell — the header draws the field, this draws the results. */
  search: KioskMenuSearchState;
}) {
  const s = useKioskUiScale();
  // Kiosk channel + per-station scope are applied by the shared selector.
  const menus = useVisibleMenus();
  const scopedToNothing = useIsStationMenuScopeEmpty();
  const resolveGroups = useModifierGroupResolver();
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);

  // Categories across every available menu, deduped by name — the pill bar
  // has no per-menu grouping to disambiguate repeats the way
  // KioskCategoryRail's menu-name headers do, so two menus sharing a
  // category name (e.g. both have "Drinks") would otherwise show as two
  // identical, unexplained pills. First occurrence wins; items still come
  // from that one category only (no merging across menus).
  const categoryEntries = useMemo(() => {
    const seen = new Set<string>();
    const entries: { key: string; name: string; category: Category }[] = [];
    for (const m of menus) {
      if (!isMenuAvailableNow(m.id)) continue;
      for (const c of m.categories as Category[]) {
        if (!c.isActive || !isCategoryAvailableNow(c.name)) continue;
        if (!hasOrderableItem(c.items, resolveGroups)) continue;
        if (seen.has(c.name)) continue;
        seen.add(c.name);
        entries.push({ key: `${m.id}:${c.id}`, name: c.name, category: c });
      }
    }
    return entries;
  }, [menus, isMenuAvailableNow, isCategoryAvailableNow, resolveGroups]);

  const pills = useMemo<CategoryPill[]>(
    () => categoryEntries.map((e) => ({ key: e.key, name: e.name })),
    [categoryEntries],
  );

  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { activeCategory, resolvedKey } = useMemo(() => {
    const found = categoryEntries.find((e) => e.key === activeKey) ?? categoryEntries[0];
    return {
      activeCategory: found?.category,
      resolvedKey: found?.key ?? null,
    };
  }, [categoryEntries, activeKey]);

  const items = useOrderableItems(activeCategory?.items);
  const handleAdd = useKioskItemAdd(onSelectItem);

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

  const isVertical = config.orientation === "vertical";
  // Template C's grid is 4-wide by default (both orientations); a manager
  // override still applies.
  const columnsPref = useKioskDeviceSettingsStore((st) => st.menuColumns);
  const numColumns = resolveKioskColumns(columnsPref, 4);
  const bannerImages = kioskOrderBannerImages(config);
  const hasMedia = bannerImages.length > 0;
  const { height: screenHeight } = useWindowDimensions();
  const bannerHeight = kioskBannerHeight(screenHeight);

  const renderMedia = (style: object) => (
    <KioskMediaCarousel imageUrls={bannerImages} videoUrl={null} style={style} />
  );

  const menuContent = (
    <>
      <KioskCategoryPillBar
        config={config}
        pills={pills}
        resolvedKey={resolvedKey}
        onSelect={handleSelectCategory}
        dimmed={search.expanded}
      />

      <View className="flex-1">
        <KioskItemGrid
          config={config}
          items={items}
          numColumns={numColumns}
          resetKey={resolvedKey}
          onSelectItem={onSelectItem}
          onAddItem={handleAdd}
        />

        {/* Results cover the grid without unmounting it, so closing search
            restores the category and scroll offset untouched. */}
        {search.expanded ? (
          <KioskSearchResults
            config={config}
            query={search.query}
            onClear={search.clear}
            onSelectItem={(item) => {
              search.close();
              onSelectItem(item);
            }}
          />
        ) : null}
      </View>
    </>
  );

  // Scoped to a selection that leaves nothing: fail closed to the empty state,
  // never to the full menu. After every hook, so the hook order is stable.
  if (scopedToNothing) return <KioskNoMenusState config={config} />;

  if (!isVertical) {
    return (
      <View className="flex-1 flex-row">
        {hasMedia ? (
          <View
            style={{
              width: "28%",
              margin: kioskPx(16, s),
              marginRight: kioskPx(8, s),
              borderRadius: kioskPx(24, s),
              overflow: "hidden",
              shadowColor: "#000000",
              shadowOpacity: 0.15,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            {renderMedia({
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              height: "100%",
            })}
          </View>
        ) : null}

        <View className="flex-1">{menuContent}</View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {hasMedia ? (
        <View
          style={{
            height: bannerHeight,
            marginHorizontal: kioskPx(16, s),
            marginTop: kioskPx(16, s),
            marginBottom: kioskPx(8, s),
            borderRadius: kioskPx(24, s),
            overflow: "hidden",
            shadowColor: "#000000",
            shadowOpacity: 0.15,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          {renderMedia({
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          })}
        </View>
      ) : null}

      {menuContent}
    </View>
  );
}
