import KioskMenuItem from "@/components/kiosk/shared/KioskMenuItem";
import type { Category, MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import type { KioskConfig } from "@/types/kiosk";
import { useMemo, useState } from "react";
import { FlatList, Pressable, SectionList, Text, View } from "react-native";

/**
 * Template A menu view — two-pane split:
 *   left rail  = categories grouped under their menu name (menu = section header)
 *   right pane = item grid for the selected category
 *
 * Split ratio follows orientation (config.orientation):
 *   horizontal → 1/4 left · 3/4 right, grid 3 columns
 *   vertical   → 1/3 left · 2/3 right, grid 2 columns
 *
 * Reads the menu tree from useMenuStore (menus → categories → items), filtered
 * to what's available now. Tapping an item hands it up via onSelectItem.
 */
interface CategorySection {
  menuId: string;
  title: string; // menu name
  data: Category[];
}

export function KioskMenuView({
  config,
  onSelectItem,
}: {
  config: KioskConfig;
  onSelectItem: (item: MenuItemType) => void;
}) {
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);

  const isVertical = config.orientation === "vertical";
  const numColumns = isVertical ? 2 : 4;

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
            (c.items?.length ?? 0) > 0,
        ),
      }))
      .filter((s) => s.data.length > 0);
  }, [menus, isMenuAvailableNow, isCategoryAvailableNow]);

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

  const items = useMemo(
    () => (activeCategory?.items ?? []).filter((i) => i.availability !== false),
    [activeCategory],
  );

  return (
    <View className="flex-1 flex-row">
      {/* Left rail — categories grouped by menu */}
      <View
        style={{
          width: isVertical ? "33.3333%" : "25%",
          backgroundColor: `${config.primaryColor}06`,
          borderRightWidth: 1,
          borderRightColor: `${config.textColor}0F`,
        }}
      >
        <SectionList
          sections={sections}
          keyExtractor={(cat, index) => `${cat.id}-${index}`}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 12 }}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingHorizontal: 12,
                paddingTop: section.menuId === sections[0]?.menuId ? 4 : 22,
                paddingBottom: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: config.accentColor,
                  marginBottom: 10,
                }}
              >
                {section.title}
              </Text>
              <View
                style={{
                  height: 1,
                  backgroundColor: `${config.textColor}12`,
                }}
              />
            </View>
          )}
          renderItem={({ item: cat, section }) => {
            const key = `${section.menuId}:${cat.id}`;
            const selected = key === resolvedKey;
            return (
              <Pressable
                onPress={() => setActiveKey(key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 15,
                  marginBottom: 6,
                  borderRadius: 14,
                  backgroundColor: selected
                    ? config.primaryColor
                    : "transparent",
                  ...(selected
                    ? {
                        shadowColor: config.primaryColor,
                        shadowOpacity: 0.3,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 4,
                      }
                    : {}),
                }}
              >
                
               
                <Text
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontWeight: selected ? "700" : "500",
                    color: selected ? "#FFFFFF" : config.textColor,
                  }}
                  numberOfLines={2}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={{ padding: 20, color: `${config.textColor}99` }}>
              No categories available.
            </Text>
          }
        />
      </View>

      {/* Right pane — item grid */}
      <View className="flex-1">
        <FlatList
          key={numColumns}
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={numColumns}
          columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
          contentContainerStyle={{ padding: 16 }}
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
              <Text style={{ fontSize: 18, color: `${config.textColor}99` }}>
                No items in this category.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}
