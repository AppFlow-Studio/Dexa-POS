import { categoryPillsFromSections } from "@/components/kiosk/shared/kioskCategoryPills";
import { KioskCategoryPillBar } from "@/components/kiosk/shared/KioskCategoryPillBar";
import {
  KioskCategoryRail,
  type CategorySection,
} from "@/components/kiosk/shared/KioskCategoryRail";
import { KioskItemGrid } from "@/components/kiosk/shared/KioskItemGrid";
import {
  kioskRailWidth,
  kioskUsesCategoryRail,
} from "@/components/kiosk/shared/kioskLayout";
import { KioskSearchResults } from "@/components/kiosk/shared/KioskSearchResults";
import type { KioskMenuSearchState } from "@/components/kiosk/shared/useKioskMenuSearchState";
import type { MenuItemType } from "@/lib/types";
import {
  kioskItemSourceFromKey,
  type KioskItemSource,
} from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { useMemo } from "react";
import { useWindowDimensions, View } from "react-native";

/**
 * The categories + item grid body shared by Templates A and B.
 *
 * Where the panel is wide enough it is the two-pane split: the category rail
 * (grouped under menu headings) beside the grid. On a portrait phone a rail
 * would take a third of 360dp and leave the grid too narrow for a card, so the
 * same categories become the horizontal strip Template C uses, above a
 * full-width grid — see kioskUsesCategoryRail. Selection keys are shared, so a
 * rotation between the two keeps the customer's category.
 *
 * Search results cover the categories and grid without unmounting them, so
 * closing search restores the category and scroll offset untouched. In the
 * strip layout they cover the grid only and the strip dims, as in Template C.
 */
export function KioskCategoryMenuBody({
  config,
  sections,
  resolvedKey,
  onSelectCategory,
  items,
  numColumns,
  search,
  onSelectItem,
}: {
  config: KioskConfig;
  sections: CategorySection[];
  resolvedKey: string | null;
  onSelectCategory: (key: string) => void;
  /** Orderable items of the selected category. */
  items: MenuItemType[];
  numColumns: number;
  search: KioskMenuSearchState;
  /** `source` is the menu + category the item was picked from. */
  onSelectItem: (item: MenuItemType, source?: KioskItemSource) => void;
}) {
  const { width } = useWindowDimensions();
  const isVertical = config.orientation === "vertical";
  const pills = useMemo(() => categoryPillsFromSections(sections), [sections]);

  const grid = (
    <KioskItemGrid
      config={config}
      items={items}
      numColumns={numColumns}
      resetKey={resolvedKey}
      onSelectItem={(item) =>
        onSelectItem(item, kioskItemSourceFromKey(resolvedKey))
      }
    />
  );

  const results = search.expanded ? (
    <KioskSearchResults
      config={config}
      query={search.query}
      onClear={search.clear}
      onSelectItem={(item, source) => {
        search.close();
        onSelectItem(item, source);
      }}
    />
  ) : null;

  if (!kioskUsesCategoryRail(width)) {
    return (
      <View className="flex-1">
        <KioskCategoryPillBar
          config={config}
          pills={pills}
          resolvedKey={resolvedKey}
          onSelect={onSelectCategory}
          dimmed={search.expanded}
        />
        <View className="flex-1">
          {grid}
          {results}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-1 flex-row">
        {/* Left rail — categories grouped by menu */}
        <View style={{ width: kioskRailWidth(isVertical, numColumns) }}>
          <KioskCategoryRail
            config={config}
            sections={sections}
            resolvedKey={resolvedKey}
            onSelect={onSelectCategory}
          />
        </View>

        {/* Right pane — item grid */}
        <View className="flex-1">{grid}</View>
      </View>

      {results}
    </View>
  );
}
