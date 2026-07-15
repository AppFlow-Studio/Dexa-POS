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

const SkiaTable: React.FC<{ draw: TableDrawData; isSelected: boolean }> = ({
  draw,
  isSelected,
}) => {
  return (
    <Group
      transform={[
        { translateX: draw.x + draw.width / 2 },
        { translateY: draw.y + draw.height / 2 },
        { rotate: (draw.rotation * Math.PI) / 180 },
        { translateX: -draw.width / 2 },
        { translateY: -draw.height / 2 },
      ]}
    >
      <SkiaShape
        shapeId={draw.shapeId}
        width={draw.width}
        height={draw.height}
        color={draw.color}
        darkMode={draw.darkMode}
        isSelected={isSelected}
        attention={draw.attention}
      />
      <SkiaTableContent
        width={draw.width}
        height={draw.height}
        lines={draw.lines}
        badges={draw.badges}
      />
    </Group>
  );
};

export default React.memo(SkiaTable);
