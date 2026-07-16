import { Circle, RoundedRect } from "@shopify/react-native-skia";
import React from "react";
import {
  getTableShapeGeometry,
  ShapePrimitive,
} from "@/lib/table-shape-geometry";
import { colors } from "@/lib/theme";

/**
 * Draws one table/booth shape into the shared Skia surface from its geometry
 * descriptor. Emits ONLY plain RoundedRect/Circle nodes with numeric props —
 * viewBox→box scaling is baked into the coordinates in JS so there are NO Skia
 * <Group> transforms/origins here (a malformed Group transform was crashing the
 * whole surface with "skGroup: Cannot read property 'x'").
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
  const sx = geometry ? width / geometry.viewBox[0] : 1;
  const sy = geometry ? height / geometry.viewBox[1] : 1;

  const nodes: React.ReactNode[] = [];

  if (geometry) {
    geometry.primitives.forEach((p: ShapePrimitive, i) => {
      const fillOpacity = darkMode ? p.fillOpacityDark : p.fillOpacityLight;
      const strokeOpacity = darkMode ? p.strokeOpacityDark : p.strokeOpacityLight;

      if (p.kind === "rect") {
        const x = (p.x ?? 0) * sx;
        const y = (p.y ?? 0) * sy;
        const w = (p.width ?? 0) * sx;
        const h = (p.height ?? 0) * sy;
        const r = (p.rx ?? 0) * Math.min(sx, sy);
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
            strokeWidth={p.strokeWidth}
            opacity={strokeOpacity}
          />,
        );
      } else {
        const cx = (p.cx ?? 0) * sx;
        const cy = (p.cy ?? 0) * sy;
        // Circles scale uniformly (avg) so they stay round on non-square boxes.
        const rad = (p.r ?? 0) * ((sx + sy) / 2);
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
            strokeWidth={p.strokeWidth}
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

  if (isSelected) {
    nodes.push(
      <RoundedRect
        key="sel"
        x={-3}
        y={-3}
        width={width + 6}
        height={height + 6}
        r={18}
        color={colors.info}
        style="stroke"
        strokeWidth={2}
      />,
    );
  } else if (attention) {
    nodes.push(
      <RoundedRect
        key="attn"
        x={-3}
        y={-3}
        width={width + 6}
        height={height + 6}
        r={18}
        color="rgba(248,113,113,0.6)"
        style="stroke"
        strokeWidth={2.5}
      />,
    );
  }

  return <>{nodes}</>;
};

export default React.memo(SkiaShape);
