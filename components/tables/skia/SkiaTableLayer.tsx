import { Canvas, Group, useCanvasRef } from "@shopify/react-native-skia";
import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet } from "react-native";
import { SharedValue, useDerivedValue } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

import { WallEdgeFlags } from "@/lib/wallCornerSnap";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import SkiaStructure from "./SkiaStructure";
import SkiaTable from "./SkiaTable";
import { loadTableTypefaces } from "./skiaTableFont";
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

  // Load font files from BUNDLED bytes (network-free — see skiaTableFont.ts). The
  // old useTypeface path fetched the TTF over HTTP from Metro, so offline the fonts
  // never loaded and table text vanished. loadTableTypefaces reads the on-device
  // asset via expo-asset/expo-file-system and sets the module-level typefaces used
  // by getTableFont. Process-wide + idempotent: shared across every SkiaTableLayer
  // mount, so there's nothing to clear on unmount. `fontsReady` just forces one
  // re-render when the async load completes so text nodes start drawing.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadTableTypefaces()
      .then((tf) => {
        if (alive && tf.regular && tf.bold) setFontsReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ── GPU surface-loss recovery ────────────────────────────────────────────
  // The canvas going permanently blank while the app sits IDLE (no remount, no
  // theme change, no floor switch) is Android reclaiming the SurfaceView / EGL
  // context backing the Canvas: screen dim, display-power-management, or memory
  // pressure destroys the native surface, but our JS component stays mounted and
  // never re-renders (idle = no store change → useShallow doesn't fire), so Skia
  // never re-issues its picture to a fresh surface and the view stays blank.
  //
  // Fix: bump a key on the <Canvas> whenever the app returns to `active`. That
  // tears down the (possibly dead) surface and mounts a fresh one that repaints
  // from the current React tree. Only the Canvas is re-keyed — typefaces, camera
  // shared values, and the store subscription all live on SkiaTableLayer and are
  // untouched, so recovery is cheap and state-preserving.
  // Ref to the live Canvas so the foreground heartbeat below can force a redraw
  // (re-issue the picture to a possibly-recreated native surface) without a full
  // remount.
  const canvasRef = useCanvasRef();

  const [surfaceKey, setSurfaceKey] = useState(0);
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      // inactive/background → active is exactly the transition after a screen
      // dim/wake or an OS surface reclaim, when the GL surface may be stale.
      if (prev !== "active" && next === "active") {
        setSurfaceKey((k) => k + 1);
      }
    });
    return () => sub.remove();
  }, []);

  // ── Foreground redraw heartbeat ──────────────────────────────────────────
  // The modern rn-skia <Canvas> (2.x) has no "continuous" mode — it repaints
  // only when its React tree or a Reanimated value it reads changes. The camera
  // transform is a Reanimated derived value that only changes DURING gestures,
  // so an idle floor plan issues no draws. If Android reclaims the EGL/
  // SurfaceView backing the Canvas while foregrounded and idle (screen dim, DPM,
  // memory pressure, another Skia surface tearing down the shared GL context) —
  // a path that fires NO AppState transition — nothing ever re-issues the
  // picture to the recreated surface and the whole canvas stays permanently
  // blank until process restart. That is the "blanks mid-session, never
  // recovers, bg→fg doesn't help" report.
  //
  // Fix: a low-frequency heartbeat that calls redraw() while foregrounded. This
  // re-issues the existing picture to the current native surface (no React
  // reconciliation, no remount/flicker — far cheaper than bumping surfaceKey),
  // so once the OS provides a fresh surface it repaints on the next tick. It's
  // the on-demand equivalent of the old continuous mode and is idempotent/cheap
  // for a static scene.
  useEffect(() => {
    const REDRAW_INTERVAL_MS = 2000;
    const id = setInterval(() => {
      if (AppState.currentState !== "active") return;
      try {
        canvasRef.current?.redraw();
      } catch {
        // A dead/torn-down native view can throw here; ignore — the AppState
        // surfaceKey remount is the hard-recovery fallback.
      }
    }, REDRAW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [canvasRef]);

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
  const cameraTransform = useDerivedValue(() => {
    "worklet";
    // Sanitize on the UI thread. A non-finite scale/translate (a gesture-math
    // edge case, a spring overshoot to NaN, a 0-scale) baked into the Group
    // matrix can fault the native Skia surface and leave the canvas permanently
    // blank. Clamp scale to a sane positive range and coerce non-finite offsets
    // to 0 so the transform is always a valid, invertible matrix.
    const rawScale = scale.value;
    const s = Number.isFinite(rawScale) ? Math.min(Math.max(rawScale, 0.01), 10) : 1;
    const tx = Number.isFinite(translateX.value) ? translateX.value : 0;
    const ty = Number.isFinite(translateY.value) ? translateY.value : 0;
    return [
      { translateX: tx + vcx },
      { translateY: ty + vcy },
      { scale: s },
      { translateX: -vcx },
      { translateY: -vcy },
    ];
  }, [vcx, vcy]);

  // ── HOOKS MUST NOT SIT BELOW A CONDITIONAL `return null` ──
  // Previously the viewport `return null` (below) ran BEFORE the `useRef` that
  // latched font resolution, changing the hook count on a transient 0-width frame
  // → React remounted the component, blanking the Canvas. The latch is declared
  // here, unconditionally, before any early return.
  const viewportEverValid = useRef(false);
  const viewportValid = viewportWidth > 0 && viewportHeight > 0;
  if (viewportValid) viewportEverValid.current = true;

  // Bail ONLY on viewport, and only before the FIRST successful mount — NEVER on
  // fonts. The Canvas must not be gated on font resolution: table shapes and
  // structures are pure geometry and paint immediately; only <Text> needs the
  // typefaces (getTableFont returns null until they load, and every Text site skips
  // when font is null). Gating the whole Canvas on fonts is what blanked the entire
  // Skia floor plan offline while fonts were fetched over the network.
  if (!viewportEverValid.current && !viewportValid) return null;

  // `fontsReady` is passed DOWN as a prop (not just referenced here). Re-rendering
  // this layer alone is not enough: SkiaTable/SkiaTableContent/SkiaStructure are all
  // React.memo, and the font load changes none of their data props — so they'd all
  // bail out and keep their memoized textless output. Threading the flag through is
  // what actually invalidates their memo and makes getTableFont run again.
  return (
    <Canvas
      key={surfaceKey}
      ref={canvasRef}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Group transform={cameraTransform}>
        {/* Structures first (walls/zones behind tables). */}
        {structures.map((s) => (
          <SkiaStructure
            key={s.id}
            table={s}
            darkMode={darkMode}
            wallEdgeFlags={wallEdgeFlagsById[s.id]}
            fontsReady={fontsReady}
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
              fontsReady={fontsReady}
            />
          );
        })}
      </Group>
    </Canvas>
  );
};

export default React.memo(SkiaTableLayer);
