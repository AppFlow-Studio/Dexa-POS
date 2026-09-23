import { KioskCategoryRail, type CategorySection } from "@/components/kiosk/shared/KioskCategoryRail";
import {
  hasOrderableItem,
  useModifierGroupResolver,
  useOrderableItems,
} from "@/components/kiosk/shared/kioskItemAvailability";
import { KioskItemGrid } from "@/components/kiosk/shared/KioskItemGrid";
import { kioskBannerHeight, kioskRailWidth } from "@/components/kiosk/shared/kioskLayout";
import { KioskNoMenusState } from "@/components/kiosk/shared/KioskNoMenusState";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { KioskSearchResults } from "@/components/kiosk/shared/KioskSearchResults";
import type { KioskMenuSearchState } from "@/components/kiosk/shared/useKioskMenuSearchState";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import {
  useIsStationMenuScopeEmpty,
  useVisibleMenus,
} from "@/hooks/menu/useVisibleMenus";
import type { MenuItemType } from "@/lib/types";
import {
  kioskItemSourceFromKey,
  type KioskItemSource,
} from "@/stores/useKioskCartStore";
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
 * Template B menu view — same two-pane category/item split as Template A,
 * plus a media banner right under the header: an image carousel drawing on
 * the order-banner images configured for this orientation (a separate slot
 * from the idle-screen media — no video here, video is idle-only). Split
 * ratio and column count follow orientation, same as Template A.
 *
 * The banner only shows in vertical orientation — landscape screens are too
 * short to spare the vertical space for both a banner and a comfortable
 * rail + grid, so horizontal drops the banner entirely (rail + grid only,
 * like Template A).
 *
 * Nothing sits between the banner and the split: categories are in the rail
 * and search lives in the header, so the rail and grid get the whole of what
 * the banner leaves.
 */
export function KioskMenuViewB({
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
  const s = useKioskUiScale();
  // Kiosk channel + per-station scope are applied by the shared selector.
  const menus = useVisibleMenus();
  const scopedToNothing = useIsStationMenuScopeEmpty();
  const resolveGroups = useModifierGroupResolver();
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);

  const isVertical = config.orientation === "vertical";
  const columnsPref = useKioskDeviceSettingsStore((st) => st.menuColumns);
  const numColumns = resolveKioskColumns(columnsPref, isVertical ? 3 : 4);

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

  const bannerImages = kioskOrderBannerImages(config);
  const hasMedia = bannerImages.length > 0 && isVertical;
  const { height: screenHeight } = useWindowDimensions();
  const bannerHeight = kioskBannerHeight(screenHeight);

  // Scoped to a selection that leaves nothing: fail closed to the empty state,
  // never to the full menu. After every hook, so the hook order is stable.
  if (scopedToNothing) return <KioskNoMenusState config={config} />;

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
          <KioskMediaCarousel
            imageUrls={bannerImages}
            videoUrl={null}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </View>
      ) : null}

      <View className="flex-1">
        <View className="flex-1 flex-row">
          {/* Left rail — categories grouped by menu */}
          <View style={{ width: kioskRailWidth(isVertical, numColumns) }}>
            <KioskCategoryRail
              config={config}
              sections={sections}
              resolvedKey={resolvedKey}
              onSelect={handleSelectCategory}
            />
          </View>

          {/* Right pane — item grid */}
          <View className="flex-1">
            <KioskItemGrid
              config={config}
              items={items}
              numColumns={numColumns}
              resetKey={resolvedKey}
              onSelectItem={(item) =>
                onSelectItem(item, kioskItemSourceFromKey(resolvedKey))
              }
            />
          </View>
        </View>

        {/* Results cover the rail and grid without unmounting them, so closing
            search restores the category and scroll offset untouched. */}
        {search.expanded ? (
          <KioskSearchResults
            config={config}
            query={search.query}
            onClear={search.clear}
            onSelectItem={(item, source) => {
              search.close();
              onSelectItem(item, source);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
