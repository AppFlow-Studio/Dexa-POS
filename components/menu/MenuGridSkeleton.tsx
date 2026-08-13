import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useSettingsStore } from "@/stores/useSettingsStore";
import React from "react";
import { View } from "react-native";

/**
 * Placeholder for the menu grid while the first sync is still in flight.
 *
 * Geometry deliberately mirrors the real thing so the swap isn't a jolt:
 * a category chip row, then a 5-column grid (`numColumns` in MenuSection) of
 * tiles at the same estimated height the FlashList uses (240 with images, 86
 * without — see `estimatedItemSize`).
 *
 * Static, like the other skeletons in this codebase (ModifierScreenSkeleton,
 * TableLayoutSkeleton). A pulse here would animate on the same JS/UI thread the
 * boot sync is competing for, and this is exactly the moment not to spend it.
 */
const MenuGridSkeleton: React.FC = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const showMenuImages = useSettingsStore((st) => st.showMenuImages);

  const tileHeight = showMenuImages ? s(200) : s(80);
  const rows = showMenuImages ? 2 : 5;
  const columns = 5;

  // Deliberately NOT flex:1. This renders in MenuSection's category-controls
  // slot, whose sibling grid area is already flex-1 — claiming a flex share
  // here would split the column in half and clip the tiles mid-row. Sizing to
  // content lays the chips + tiles out from the top and lets the sibling absorb
  // the remainder, which is exactly how the real menu sits.
  return (
    <View pointerEvents="none" accessibilityLabel="Loading menu">
      {/* Category chips (matches MenuControls' pill row) */}
      <View
        style={{
          flexDirection: "row",
          gap: s(8),
          paddingBottom: s(12),
        }}
      >
        {[92, 74, 108, 68, 86].map((width, i) => (
          <View
            key={i}
            style={{
              width: s(width),
              height: s(34),
              borderRadius: s(10),
              backgroundColor: i === 0 ? colors.teal + "25" : colors.skeleton,
              borderWidth: 1,
              borderColor: i === 0 ? colors.teal + "40" : colors.border,
            }}
          />
        ))}
      </View>

      {/* Item tiles */}
      <View style={{ marginTop: s(8) }}>
        {Array.from({ length: rows }).map((_, row) => (
          <View key={row} style={{ flexDirection: "row" }}>
            {Array.from({ length: columns }).map((__, col) => (
              <View
                key={col}
                // Mirrors menuSectionStyles.gridCell: flex:1 share of the row,
                // 3pt horizontal gutters, 6pt below.
                style={{
                  flex: 1,
                  paddingHorizontal: s(3),
                  paddingBottom: s(6),
                }}
              >
                <View
                  style={{
                    height: tileHeight,
                    borderRadius: s(12),
                    backgroundColor: colors.skeleton,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                    justifyContent: "flex-end",
                    padding: s(8),
                  }}
                >
                  {/* Name + price lines, so a tile reads as a card not a slab */}
                  <View
                    style={{
                      width: "70%",
                      height: s(10),
                      borderRadius: s(4),
                      backgroundColor: colors.skeletonHighlight,
                    }}
                  />
                  <View
                    style={{
                      width: "35%",
                      height: s(9),
                      borderRadius: s(4),
                      marginTop: s(6),
                      backgroundColor: colors.skeletonHighlight,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

export default React.memo(MenuGridSkeleton);
