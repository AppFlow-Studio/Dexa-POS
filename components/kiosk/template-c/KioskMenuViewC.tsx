import { KioskCategoryPillBar } from "@/components/kiosk/shared/KioskCategoryPillBar";
import { type CategorySection } from "@/components/kiosk/shared/KioskCategoryRail";
import KioskMenuItem from "@/components/kiosk/shared/KioskMenuItem";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import type { Category, MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import { useMenuStore } from "@/stores/useMenuStore";
import type { KioskConfig } from "@/types/kiosk";
import { useMemo, useState } from "react";
import { FlatList, Image, Text, View } from "react-native";

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

  const sections = useMemo<CategorySection[]>(() => {
    return menus
      .filter((m) => isMenuAvailableNow(m.id))
      .map((m) => ({
        menuId: m.id,
        title: m.name,
        data: m.categories.filter(
          (c: Category) =>
            c.isActive &&
            isCategoryAvailableNow(c.name) &&
            (c.items?.length ?? 0) > 0,
        ),
      }))
      .filter((sec) => sec.data.length > 0);
  }, [menus, isMenuAvailableNow, isCategoryAvailableNow]);

  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { activeCategory, resolvedKey } = useMemo(() => {
    const all = sections.flatMap((sec) =>
      sec.data.map((c) => ({ key: `${sec.menuId}:${c.id}`, category: c })),
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

  const isVertical = config.orientation === "vertical";
  // Vertical: banner on top, grid spans full width, so 4 columns fits.
  // Horizontal: banner becomes a left sidebar (~28% width), leaving less
  // room for the grid — matches Templates A/B's 4-column horizontal count.
  const numColumns = 4;
  const hasCarousel =
    config.attractImageUrls.length > 0 || !!config.attractVideoUrl;
  const hasMedia = hasCarousel || !!config.heroImageUrl;
  const bannerHeight = kioskPx(420, s);

  const renderMedia = (style: object) =>
    hasCarousel ? (
      <KioskMediaCarousel
        imageUrls={config.attractImageUrls}
        videoUrl={config.attractVideoUrl}
        style={style}
      />
    ) : (
      <Image
        source={{ uri: config.heroImageUrl! }}
        style={style}
        resizeMode="cover"
      />
    );

  const menuContent = (
    <>
      <KioskCategoryPillBar
        config={config}
        sections={sections}
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
