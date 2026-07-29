import { Group } from "@shopify/react-native-skia";
import React from "react";

import SkiaShape from "./SkiaShape";
import SkiaTableContent from "./SkiaTableContent";
import { TableDrawData } from "./tableDrawStore";

/**
 * Pure Skia draw of one table from PLAIN data (no hooks — see tableDrawStore.ts on
 * why Canvas children can't run hooks/stores). Applies the table's own translate +
 * rotation; the camera transform is applied by the parent Group in SkiaTableLayer.
 */

const num = (v: number, fallback: number): number =>
  Number.isFinite(v) ? v : fallback;

const SkiaTable: React.FC<{ draw: TableDrawData; isSelected: boolean }> = ({
  draw,
  isSelected,
}) => {
  // Sanitize geometry before it reaches the Group transform. A non-finite x/y/
  // width/height/rotation (bad backend row, in-flight resize, division edge) baked
  // into a Skia matrix can fault the whole surface (this is the class behind the
  // historical "skGroup: Cannot read property 'x'" crash). width/height fall back
  // to a visible 1px so a bad row draws a dot instead of killing the canvas.
  const x = num(draw.x, 0);
  const y = num(draw.y, 0);
  const width = Math.max(1, num(draw.width, 100));
  const height = Math.max(1, num(draw.height, 100));
  const rotation = num(draw.rotation, 0);

  return (
    <Group
      transform={[
        { translateX: x + width / 2 },
        { translateY: y + height / 2 },
        { rotate: (rotation * Math.PI) / 180 },
        { translateX: -width / 2 },
        { translateY: -height / 2 },
      ]}
    >
      <SkiaShape
        shapeId={draw.shapeId}
        width={width}
        height={height}
        color={draw.color}
        darkMode={draw.darkMode}
        isSelected={isSelected}
        attention={draw.attention}
      />
      <SkiaTableContent
        width={width}
        height={height}
        shapeId={draw.shapeId}
        lines={draw.lines}
        badges={draw.badges}
      />
    </Group>
  );
};

export default React.memo(SkiaTable);
