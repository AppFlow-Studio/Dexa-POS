import { Circle, RoundedRect } from "@shopify/react-native-skia";
import React from "react";
import {
  getTableShapeGeometry,
  ShapePrimitive,
} from "@/lib/table-shape-geometry";
import { colors } from "@/lib/theme";

/**
 * Draws one table/booth shape into the shared Skia surface from its geometry
 * descriptor, reproducing exactly what the react-native-svg components render:
 *
 * - viewBox → box mapping uses UNIFORM scale + centering (react-native-svg's
 *   default `preserveAspectRatio="xMidYMid meet"`), NOT per-axis stretch. This
 *   matters both for shapes whose registry size isn't proportional to their
 *   viewBox (booth-2: 150×100 box vs 180×80 viewBox) and for user-resized boxes.
 * - Stroke widths are authored in viewBox units and therefore scale with the
 *   box, exactly like SVG strokes do.
 * - Per-primitive `rotate` (circle-6 chairs orbiting the table) is applied about
 *   the primitive's own center via per-node transform/origin props.
 *
 * Emits ONLY plain RoundedRect/Circle nodes — no Skia <Group> wrappers (a
 * malformed Group transform was crashing the whole surface with "skGroup:
 * Cannot read property 'x'"). Rotation uses the leaf nodes' own
 * `transform`/`origin` props instead.
 */

interface SkiaShapeProps {
  shapeId: string;
  width: number; // rendered box size (world units)
  height: number;
  color: string;
  darkMode: boolean;
  isSelected: boolean;
  attention: boolean;
}

const SkiaShape: React.FC<SkiaShapeProps> = ({
  shapeId,
  width,
  height,
  color,
  darkMode,
  isSelected,
  attention,
}) => {
  const geometry = getTableShapeGeometry(shapeId);
  // xMidYMid meet: uniform scale to fit, content centered in the box. Guard the
  // divide: a 0/non-finite viewBox dim would make `s` Infinity/NaN, which then
  // propagates into stroke widths / radii and can fault the native surface.
  const vbW = geometry && geometry.viewBox[0] > 0 ? geometry.viewBox[0] : 1;
  const vbH = geometry && geometry.viewBox[1] > 0 ? geometry.viewBox[1] : 1;
  const rawS = geometry ? Math.min(width / vbW, height / vbH) : 1;
  const s = Number.isFinite(rawS) && rawS > 0 ? rawS : 1;
  const ox = geometry ? (width - geometry.viewBox[0] * s) / 2 : 0;
  const oy = geometry ? (height - geometry.viewBox[1] * s) / 2 : 0;

  const nodes: React.ReactNode[] = [];

  if (geometry) {
    geometry.primitives.forEach((p: ShapePrimitive, i) => {
      const fillOpacity = darkMode ? p.fillOpacityDark : p.fillOpacityLight;
      const strokeOpacity = darkMode ? p.strokeOpacityDark : p.strokeOpacityLight;
      const strokeWidth = p.strokeWidth * s;

      if (p.kind === "rect") {
        const x = ox + (p.x ?? 0) * s;
        const y = oy + (p.y ?? 0) * s;
        const w = (p.width ?? 0) * s;
        const h = (p.height ?? 0) * s;
        const r = (p.rx ?? 0) * s;
        const rot =
          p.rotate != null
            ? {
                origin: { x: x + w / 2, y: y + h / 2 },
                transform: [{ rotate: (p.rotate * Math.PI) / 180 }],
              }
            : undefined;
        if (!p.noFill) {
          nodes.push(
            <RoundedRect
              key={`rf${i}`}
              x={x}
              y={y}
              width={w}
              height={h}
              r={r}
              color={color}
              opacity={fillOpacity}
              {...rot}
            />,
          );
        }
        nodes.push(
          <RoundedRect
            key={`rs${i}`}
            x={x}
            y={y}
            width={w}
            height={h}
            r={r}
            color={color}
            style="stroke"
            strokeWidth={strokeWidth}
            opacity={strokeOpacity}
            {...rot}
          />,
        );
      } else {
        const cx = ox + (p.cx ?? 0) * s;
        const cy = oy + (p.cy ?? 0) * s;
        const rad = (p.r ?? 0) * s;
        if (!p.noFill) {
          nodes.push(
            <Circle
              key={`cf${i}`}
              cx={cx}
              cy={cy}
              r={rad}
              color={color}
              opacity={fillOpacity}
            />,
          );
        }
        nodes.push(
          <Circle
            key={`cs${i}`}
            cx={cx}
            cy={cy}
            r={rad}
            color={color}
            style="stroke"
            strokeWidth={strokeWidth}
            opacity={strokeOpacity}
          />,
        );
      }
    });
  } else {
    nodes.push(
      <RoundedRect
        key="fallback"
        x={0}
        y={0}
        width={width}
        height={height}
        r={16}
        color={color}
      />,
    );
  }

  // RN borders paint INSIDE the view bounds; a Skia stroke is centered on the
  // path. Each ring below is the RN border's outer rect inset by strokeWidth/2
  // (radius reduced likewise) so the painted band lands on the same pixels.
  if (isSelected) {
    // TableCardContent selection: View inset -3, borderWidth 2, borderRadius 18.
    nodes.push(
      <RoundedRect
        key="sel"
        x={-2}
        y={-2}
        width={width + 4}
        height={height + 4}
        r={17}
        color={colors.info}
        style="stroke"
        strokeWidth={2}
      />,
    );
  } else if (attention) {
    // PulsingBorder: at the box bounds (no inset), borderWidth 2.5, radius 16.
    nodes.push(
      <RoundedRect
        key="attn"
        x={1.25}
        y={1.25}
        width={width - 2.5}
        height={height - 2.5}
        r={14.75}
        color="rgba(248,113,113,0.6)"
        style="stroke"
        strokeWidth={2.5}
      />,
    );
  }

  return <>{nodes}</>;
};

export default React.memo(SkiaShape);
