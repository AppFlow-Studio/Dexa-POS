import { KioskCategoryRail, type CategorySection } from "@/components/kiosk/shared/KioskCategoryRail";
import KioskMenuItem from "@/components/kiosk/shared/KioskMenuItem";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import { isMenuVisibleOnChannel } from "@/lib/menu/menuChannelVisibility";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import {
  resolveKioskColumns,
  useKioskDeviceSettingsStore,
} from "@/stores/useKioskDeviceSettingsStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { kioskOrderBannerImages, type KioskConfig } from "@/types/kiosk";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";

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
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);

  const isVertical = config.orientation === "vertical";
  const columnsPref = useKioskDeviceSettingsStore((st) => st.menuColumns);
  const numColumns = resolveKioskColumns(columnsPref, isVertical ? 3 : 4);

  const sections = useMemo<CategorySection[]>(() => {
    return menus
      .filter(
        (m) =>
          isMenuVisibleOnChannel(m, "kiosk") && isMenuAvailableNow(m.id),
      )
      .map((m) => ({
        menuId: m.id,
        title: m.name,
        data: m.categories.filter(
          (c) =>
            c.isActive &&
            isCategoryAvailableNow(c.name) &&
            (c.items?.length ?? 0) > 0,
        ),
      }))
      .filter((s) => s.data.length > 0);
  }, [menus, isMenuAvailableNow, isCategoryAvailableNow]);

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

  const items = useMemo(
    () => (activeCategory?.items ?? []).filter((i) => i.availability !== false),
    [activeCategory],
  );

  const bannerImages = kioskOrderBannerImages(config);
  const hasMedia = bannerImages.length > 0 && isVertical;
  const bannerHeight = kioskPx(420, s);

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
        <View style={{ width: isVertical ? "33.3333%" : "25%" }}>
          <KioskCategoryRail
            config={config}
            sections={sections}
            resolvedKey={resolvedKey}
            onSelect={setActiveKey}
          />
        </View>

        {/* Right pane — item grid */}
        <View className="flex-1">
          <FlatList
            key={numColumns}
            data={items}
            keyExtractor={(i) => i.id}
            numColumns={numColumns}
            columnWrapperStyle={{
              gap: kioskPx(12, s),
              marginBottom: kioskPx(12, s),
            }}
            contentContainerStyle={{ padding: kioskPx(16, s) }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={{ flex: 1 / numColumns }}>
                <KioskMenuItem
                  item={item}
                  config={config}
                  onPress={onSelectItem}
                />
              </View>
            )}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text
                  style={{
                    fontSize: kioskPx(18, s),
                    color: `${config.textColor}99`,
                  }}
                >
                  No items in this category.
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </View>
  );
}
