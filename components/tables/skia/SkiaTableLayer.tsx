import { Canvas, Group, useTypeface } from "@shopify/react-native-skia";
import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { SharedValue, useDerivedValue } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

import { WallEdgeFlags } from "@/lib/wallCornerSnap";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import SkiaStructure from "./SkiaStructure";
import SkiaTable from "./SkiaTable";
import { setTableTypefaces } from "./skiaTableFont";
import { useTableDrawStore } from "./tableDrawStore";

/**
 * Single Skia surface drawing every on-screen (windowed) table/booth — shape, text,
 * and badges — replacing the one-svg-surface-per-table view tree AND the per-table
 * RN text overlay. A table contributes ZERO native views.
 *
 * All live data is prepared OUTSIDE the Canvas (by TableDataPublisher → tableDrawStore)
 * because react-native-skia Canvas children can't run hooks/stores/context. This
 * component subscribes to the store ONCE here, at the top (outside the Canvas
 * children), and passes plain data down.
 *
 * The camera pan/zoom is applied INSIDE Skia via a top-level <Group> transform driven
 * by the same Reanimated shared values as the RN structures layer, keeping them
 * frame-locked.
 */

interface SkiaTableLayerProps {
  /** On-screen table/booth objects only (already viewport-windowed). */
  tables: FloorPlanObject[];
  /** On-screen static structures (walls/doors/etc.), already windowed. */
  structures: FloorPlanObject[];
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  viewportWidth: number;
  viewportHeight: number;
  selectedTableIds: Set<string>;
  darkMode: boolean;
  wallEdgeFlagsById: Record<string, WallEdgeFlags>;
}

const SkiaTableLayer: React.FC<SkiaTableLayerProps> = ({
  tables,
  structures,
  scale,
  translateX,
  translateY,
  viewportWidth,
  viewportHeight,
  selectedTableIds,
  darkMode,
  wallEdgeFlagsById,
}) => {
  // ONE subscription, in the RN tree (not a Canvas child).
  const drawData = useTableDrawStore(useShallow((s) => s.data));

  // Load real font files (the system FontMgr path rendered no glyphs on-device).
  // useTypeface is a hook — valid here because SkiaTableLayer is the Canvas PARENT
  // (RN tree), not a Canvas child. Fonts are built from these in skiaTableFont.
  const boldTypeface = useTypeface(require("@/assets/fonts/Inter-Bold.ttf"));
  const regularTypeface = useTypeface(
    require("@/assets/fonts/Inter-Medium.ttf"),
  );
  useEffect(() => {
    setTableTypefaces({ regular: regularTypeface, bold: boldTypeface });
  }, [regularTypeface, boldTypeface]);

  // Latch the last valid viewport so a transient 0-dim relayout frame never
  // collapses the camera center to (0,0). Kept in a ref (read during render is
  // fine — refs don't trigger renders) so the retained frame stays positioned.
  const lastValidViewport = useRef({ w: viewportWidth, h: viewportHeight });
  if (viewportWidth > 0 && viewportHeight > 0) {
    lastValidViewport.current = { w: viewportWidth, h: viewportHeight };
  }
  const effViewportWidth = lastValidViewport.current.w;
  const effViewportHeight = lastValidViewport.current.h;

  const vcx = effViewportWidth / 2;
  const vcy = effViewportHeight / 2;

  // Reproduce the RN camera model exactly.
  // RN applies transforms left-to-right with transformOrigin "center":
  //   screen = (world - vc) * s + vc + t
  // Skia transform arrays apply right-to-left (matrix multiplication order).
  const cameraTransform = useDerivedValue(
    () => [
      { translateX: translateX.value + vcx },
      { translateY: translateY.value + vcy },
      { scale: scale.value },
      { translateX: -vcx },
      { translateY: -vcy },
    ],
    [vcx, vcy],
  );

  // ── HOOKS MUST NOT SIT BELOW A CONDITIONAL `return null` ──
  // Previously the viewport `return null` (below) ran BEFORE the `useRef` that
  // latched font resolution. On any re-render where the viewport width briefly
  // measured 0 (a sidebar collapse/expand relayout emits an intermediate 0-width
  // onLayout frame, and a timed refetch re-renders through it), that early return
  // changed the hook count for the frame → React tore down and remounted the
  // component, blanking the ENTIRE Canvas (every table vanished, then repainted).
  // Both latches are declared up here, unconditionally, before any early return.
  const fontsEverResolved = useRef(false);
  const viewportEverValid = useRef(false);

  const fontsResolved = !!regularTypeface && !!boldTypeface;
  if (fontsResolved) fontsEverResolved.current = true;

  const viewportValid = viewportWidth > 0 && viewportHeight > 0;
  if (viewportValid) viewportEverValid.current = true;

  // Only bail before the FIRST successful mount. Once the Canvas has painted once
  // with a valid viewport + fonts, a transient 0-dim / not-yet-resolved font on a
  // later re-render keeps the last good frame instead of unmounting everything.
  if (!viewportEverValid.current && !viewportValid) return null;
  if (!fontsEverResolved.current && !fontsResolved) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group transform={cameraTransform}>
        {/* Structures first (walls/zones behind tables). */}
        {structures.map((s) => (
          <SkiaStructure
            key={s.id}
            table={s}
            darkMode={darkMode}
            wallEdgeFlags={wallEdgeFlagsById[s.id]}
          />
        ))}
        {tables.map((table) => {
          const draw = drawData[table.id];
          // Draw-data may lag a frame behind a newly-windowed table (its publisher
          // just mounted). Skip until it's published — avoids drawing at (0,0)/0-size.
          if (!draw) return null;
          return (
            <SkiaTable
              key={table.id}
              draw={draw}
              isSelected={selectedTableIds.has(table.id)}
            />
          );
        })}
      </Group>
    </Canvas>
  );
};

export default React.memo(SkiaTableLayer);
