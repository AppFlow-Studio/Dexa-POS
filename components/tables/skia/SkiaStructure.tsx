import {
    Group,
    ImageSVG,
    Skia,
    Text as SkiaText,
    SkSVG,
} from "@shopify/react-native-skia";
import React from "react";

import { TABLE_SHAPES } from "@/lib/table-shapes";
import { WallEdgeFlags } from "@/lib/wallCornerSnap";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { getTableFont, measureWidth } from "./skiaTableFont";
import { buildStructureSvg } from "./structureSvg";

/**
 * Draws one static structure (wall, door, pillar, plant, zone, label, functional
 * stand) on the shared Skia surface via Skia.SVG.MakeFromString + <ImageSVG>. Reuses
 * the exact SVG markup of the corresponding react-native-svg component (see
 * structureSvg.ts) so it's pixel-faithful with no geometry re-porting.
 *
 * Pure — no hooks. darkMode / wall flags / label come in as plain props (prepared in
 * the RN tree), consistent with the Canvas-child constraint.
 */

// Parsed-SVG cache. Keyed by the full input signature so re-parsing only happens when
// something actually changes (theme toggle, wall-edge change, label edit, resize).
// Hard-capped: a floor plan has ~20 distinct structure types × 2 themes = ~40 cached
// entries max, so 100 is a safe ceiling with headroom for dimension variants.
const SVG_CACHE_MAX = 100;
const svgCache = new Map<string, SkSVG | null>();

const getSvg = (key: string, build: () => string | null): SkSVG | null => {
  if (svgCache.has(key)) return svgCache.get(key)!;
  if (svgCache.size >= SVG_CACHE_MAX) {
    const firstKey = svgCache.keys().next().value;
    if (firstKey !== undefined) svgCache.delete(firstKey);
  }
  const str = build();
  const parsed = str ? Skia.SVG.MakeFromString(str) : null;
  svgCache.set(key, parsed);
  return parsed;
};

const SkiaStructure: React.FC<{
  table: FloorPlanObject;
  darkMode: boolean;
  wallEdgeFlags?: WallEdgeFlags;
}> = ({ table, darkMode, wallEdgeFlags }) => {
  const shapeDef = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
  const width = table.width ?? shapeDef?.width ?? 100;
  const height = table.height ?? shapeDef?.height ?? 100;

  // Label-text shapes use <text> in SVG markup, which Skia.SVG.MakeFromString does
  // not render. Draw text directly via Skia's native <Text> component instead.
  if (table.shape_id === "label-text") {
    const label = table.name ?? "Label";
    const defaultHeight = 50;
    const scaleY = (height || defaultHeight) / defaultHeight;
    const fontSize = Math.max(10, Math.min(28, height * 0.45 * scaleY));
    const textColor = "#94A3B8"; // matches STRUCTURE_COLOR / ZONE_LABEL_COLOR
    const font = getTableFont(fontSize, "700");
    const tw = font ? measureWidth(font, label) : 0;
    return (
      <Group
        transform={[
          { translateX: table.x + width / 2 },
          { translateY: table.y + height / 2 },
          { rotate: ((table.rotation || 0) * Math.PI) / 180 },
          { translateX: -width / 2 },
          { translateY: -height / 2 },
        ]}
      >
        {font && (
          <SkiaText
            x={width / 2 - tw / 2}
            y={height / 2 + fontSize * 0.35}
            text={label}
            font={font}
            color={textColor}
            opacity={0.85}
          />
        )}
      </Group>
    );
  }

  const f = wallEdgeFlags;
  const key = [
    table.shape_id,
    Math.round(width),
    Math.round(height),
    darkMode ? "d" : "l",
    f ? `${+f.hideTop}${+f.hideRight}${+f.hideBottom}${+f.hideLeft}` : "----",
    table.shape_id === "label-text" ? (table.name ?? "") : "",
  ].join("|");

  const svg = getSvg(key, () =>
    buildStructureSvg(
      table.shape_id,
      width,
      height,
      darkMode,
      wallEdgeFlags,
      table.name ?? "",
    ),
  );

  if (!svg) return null;

  return (
    <Group
      transform={[
        { translateX: table.x + width / 2 },
        { translateY: table.y + height / 2 },
        { rotate: ((table.rotation || 0) * Math.PI) / 180 },
        { translateX: -width / 2 },
        { translateY: -height / 2 },
      ]}
    >
      <ImageSVG svg={svg} x={0} y={0} width={width} height={height} />
    </Group>
  );
};

export default React.memo(SkiaStructure);
