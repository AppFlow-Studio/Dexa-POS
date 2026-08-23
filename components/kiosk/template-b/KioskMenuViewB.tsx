import { KioskCategoryRail, type CategorySection } from "@/components/kiosk/shared/KioskCategoryRail";
import {
  hasOrderableItem,
  useModifierGroupResolver,
  useOrderableItems,
} from "@/components/kiosk/shared/kioskItemAvailability";
import { KioskItemGrid } from "@/components/kiosk/shared/KioskItemGrid";
import { kioskBannerHeight, kioskRailWidth } from "@/components/kiosk/shared/kioskLayout";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import {
  resolveKioskColumns,
  useKioskDeviceSettingsStore,
} from "@/stores/useKioskDeviceSettingsStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { kioskOrderBannerImages, type KioskConfig } from "@/types/kiosk";
import { useMemo, useState } from "react";
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
 */
export function KioskMenuViewB({
  config,
  onSelectItem,
}: {
  config: KioskConfig;
  onSelectItem: (item: MenuItemType) => void;
}) {
  const s = useKioskUiScale();
  const menus = useMenuStore((s) => s.menus);
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

  const bannerImages = kioskOrderBannerImages(config);
  const hasMedia = bannerImages.length > 0 && isVertical;
  const { height: screenHeight } = useWindowDimensions();
  const bannerHeight = kioskBannerHeight(screenHeight);

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

        {/* Right pane — item grid */}
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
    </View>
  );
}
