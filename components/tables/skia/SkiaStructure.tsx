import {
    Group,
    ImageSVG,
    Skia,
    Text as SkiaText,
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

// SVG *string* cache. Keyed by the full input signature so markup is only rebuilt
// when something actually changes (theme toggle, wall-edge change, label edit,
// resize). Hard-capped: a floor plan has ~20 distinct structure types × 2 themes =
// ~40 cached entries max, so 100 is a safe ceiling with headroom.
//
// IMPORTANT: this must cache STRINGS, not parsed SkSVG objects. rn-skia 2.x
// auto-disposes native Skia objects when the node referencing them unmounts. A
// module-level Map of SkSVGs outlived the Canvas: on floor switch (TableLayoutView
// remounts via key={activeFloorPlanId}) the old <ImageSVG> nodes unmounted and
// their SkSVGs were freed natively — but the Map kept returning those DEAD objects
// to the next mount, which killed the Skia render loop for the rest of the app
// session (every canvas blank, survived navigation). Parsing per render keeps each
// SkSVG's lifetime tied to the node that owns it; the parse itself is µs-cheap for
// these small markups and only runs when React.memo lets a re-render through.
const SVG_CACHE_MAX = 100;
const svgStrCache = new Map<string, string | null>();

const getSvgString = (
  key: string,
  build: () => string | null,
): string | null => {
  if (svgStrCache.has(key)) return svgStrCache.get(key)!;
  if (svgStrCache.size >= SVG_CACHE_MAX) {
    const firstKey = svgStrCache.keys().next().value;
    if (firstKey !== undefined) svgStrCache.delete(firstKey);
  }
  const str = build();
  svgStrCache.set(key, str);
  return str;
};

const SkiaStructure: React.FC<{
  table: FloorPlanObject;
  darkMode: boolean;
  wallEdgeFlags?: WallEdgeFlags;
}> = ({ table, darkMode, wallEdgeFlags }) => {
  const shapeDef = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
  // `?? … ?? 100` only guards null/undefined — a NaN width from a bad row would
  // slip through into the Group transform and the built SVG string and can fault
  // the native surface. Coerce non-finite / non-positive dims to a valid fallback.
  const rawW = table.width ?? shapeDef?.width ?? 100;
  const rawH = table.height ?? shapeDef?.height ?? 100;
  const width = Number.isFinite(rawW) && rawW > 0 ? rawW : 100;
  const height = Number.isFinite(rawH) && rawH > 0 ? rawH : 100;
  const rotation = Number.isFinite(table.rotation) ? table.rotation : 0;
  const tx = Number.isFinite(table.x) ? table.x : 0;
  const ty = Number.isFinite(table.y) ? table.y : 0;

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
          { translateX: tx + width / 2 },
          { translateY: ty + height / 2 },
          { rotate: (rotation * Math.PI) / 180 },
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

  const svgStr = getSvgString(key, () =>
    buildStructureSvg(
      table.shape_id,
      width,
      height,
      darkMode,
      wallEdgeFlags,
      table.name ?? "",
    ),
  );

  // Parse fresh per render (see cache comment above): the resulting SkSVG is owned
  // by THIS node and safely disposed with it on unmount.
  const svg = svgStr ? Skia.SVG.MakeFromString(svgStr) : null;

  if (!svg) return null;

  return (
    <Group
      transform={[
        { translateX: tx + width / 2 },
        { translateY: ty + height / 2 },
        { rotate: (rotation * Math.PI) / 180 },
        { translateX: -width / 2 },
        { translateY: -height / 2 },
      ]}
    >
      <ImageSVG svg={svg} x={0} y={0} width={width} height={height} />
    </Group>
  );
};

export default React.memo(SkiaStructure);
