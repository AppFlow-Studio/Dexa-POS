import { KioskCategoryPillBar, type CategoryPill } from "@/components/kiosk/shared/KioskCategoryPillBar";
import KioskMenuItem from "@/components/kiosk/shared/KioskMenuItem";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import { isMenuVisibleOnChannel } from "@/lib/menu/menuChannelVisibility";
import type { Category, MenuItemType } from "@/lib/types";
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
 */
export function KioskMenuViewC({
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
      if (!isMenuVisibleOnChannel(m, "kiosk")) continue;
      if (!isMenuAvailableNow(m.id)) continue;
      for (const c of m.categories as Category[]) {
        if (!c.isActive || !isCategoryAvailableNow(c.name) || !c.items?.length) continue;
        if (seen.has(c.name)) continue;
        seen.add(c.name);
        entries.push({ key: `${m.id}:${c.id}`, name: c.name, category: c });
      }
    }
    return entries;
  }, [menus, isMenuAvailableNow, isCategoryAvailableNow]);

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

  const items = useMemo(
    () => (activeCategory?.items ?? []).filter((i) => i.availability !== false),
    [activeCategory],
  );

  const isVertical = config.orientation === "vertical";
  // Template C's grid is 4-wide by default (both orientations); a manager
  // override still applies.
  const columnsPref = useKioskDeviceSettingsStore((st) => st.menuColumns);
  const numColumns = resolveKioskColumns(columnsPref, 4);
  const bannerImages = kioskOrderBannerImages(config);
  const hasMedia = bannerImages.length > 0;
  const bannerHeight = kioskPx(420, s);

  const renderMedia = (style: object) => (
    <KioskMediaCarousel imageUrls={bannerImages} videoUrl={null} style={style} />
  );

  const menuContent = (
    <>
      <KioskCategoryPillBar
        config={config}
        pills={pills}
        resolvedKey={resolvedKey}
        onSelect={setActiveKey}
      />

      <FlatList
        key={numColumns}
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={numColumns}
        columnWrapperStyle={{
          gap: kioskPx(12, s),
          marginBottom: kioskPx(12, s),
        }}
        contentContainerStyle={{
          padding: kioskPx(16, s),
          flexGrow: items.length === 0 ? 1 : undefined,
        }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / numColumns }}>
            <KioskMenuItem item={item} config={config} onPress={onSelectItem} />
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
    </>
  );

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
