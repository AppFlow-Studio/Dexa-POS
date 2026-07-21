/**
 * Shape geometry descriptors for the VIEW-MODE Skia floor-plan renderer.
 *
 * Each entry mirrors the geometry of the corresponding `components/tables/svg/*.tsx`
 * component, extracted into plain data so it can be drawn on a single Skia surface
 * (see components/tables/skia/SkiaShape.tsx) instead of one react-native-svg surface
 * per table. The SVG components are still the source of truth and remain in use for
 * the palette / edit-mode / add-table modals — this file must stay visually faithful
 * to them.
 *
 * IMPORTANT — viewBox coordinate space:
 * Coordinates below are authored in each shape's own SVG `viewBox` space, which is
 * NOT always equal to the registry width/height. e.g. circle-4's SVG uses
 * `viewBox='0 0 90 90'` while its registry size is 130×130 — the SVG scales the
 * viewBox to the box. The Skia renderer therefore scales `viewBox → effectiveW/H`.
 *
 * Colors are intentionally NOT baked: fill/stroke color is resolved at draw time
 * from the live table color (varies by status), exactly like the SVG components
 * which take `color` as a prop. Only the per-primitive opacities/geometry live here.
 */

export type ShapeRole = "chair" | "surface";

export interface ShapePrimitive {
  kind: "rect" | "circle";
  role: ShapeRole;
  // rect coords (viewBox space)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rx?: number;
  // circle coords (viewBox space)
  cx?: number;
  cy?: number;
  r?: number;
  /** When true this primitive has no fill (stroke-only ring). */
  noFill?: boolean;
  /** Fill opacity in dark / light mode. Ignored when noFill. */
  fillOpacityDark: number;
  fillOpacityLight: number;
  strokeWidth: number;
  strokeOpacityDark: number;
  strokeOpacityLight: number;
  /** Optional rotation (deg) about the primitive's own center. */
  rotate?: number;
}

export interface ShapeGeometry {
  /** Authoring viewBox size; primitive coords are in this space. */
  viewBox: [number, number];
  primitives: ShapePrimitive[];
}

// Default opacities used by most chairs (matches `fillOpacity`/`strokeOpacity`
// locals in the SVG components: dark 0.12/0.5, light 0.18/0.7).
const chair = (
  p: Omit<
    ShapePrimitive,
    | "role"
    | "fillOpacityDark"
    | "fillOpacityLight"
    | "strokeOpacityDark"
    | "strokeOpacityLight"
  > &
    Partial<
      Pick<
        ShapePrimitive,
        | "fillOpacityDark"
        | "fillOpacityLight"
        | "strokeOpacityDark"
        | "strokeOpacityLight"
      >
    >,
): ShapePrimitive => ({
  role: "chair",
  fillOpacityDark: 0.12,
  fillOpacityLight: 0.18,
  strokeOpacityDark: 0.5,
  strokeOpacityLight: 0.7,
  ...p,
});

const surface = (
  p: Omit<
    ShapePrimitive,
    | "role"
    | "fillOpacityDark"
    | "fillOpacityLight"
    | "strokeOpacityDark"
    | "strokeOpacityLight"
  > &
    Partial<
      Pick<
        ShapePrimitive,
        | "fillOpacityDark"
        | "fillOpacityLight"
        | "strokeOpacityDark"
        | "strokeOpacityLight"
      >
    >,
): ShapePrimitive => ({
  role: "surface",
  fillOpacityDark: 0.12,
  fillOpacityLight: 0.18,
  strokeOpacityDark: 0.5,
  strokeOpacityLight: 0.7,
  ...p,
});

// Precomputed rotated chair centers for circle-6 (ANGLES = 0..300 step 60).
// Mirrors TableCircle6Chair: chairs orbit at CHAIR_ORBIT*1.25 = 47.5 about (75,75),
// rect is CHAIR_W×CHAIR_H (16×12) centered on the orbit point, rotated by angle.
const CIRCLE6_CHAIRS: ShapePrimitive[] = [0, 60, 120, 180, 240, 300].map(
  (angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    const cx = 75 + 47.5 * Math.sin(rad);
    const cy = 75 - 47.5 * Math.cos(rad);
    const CHAIR_W = 16;
    const CHAIR_H = 12;
    return chair({
      kind: "rect",
      x: cx - CHAIR_W / 2,
      y: cy - CHAIR_H / 2,
      width: CHAIR_W,
      height: CHAIR_H,
      rx: 3,
      strokeWidth: 1.5,
      rotate: angleDeg,
    });
  },
);

export const TABLE_SHAPE_GEOMETRY: Record<string, ShapeGeometry> = {
  "square-2": {
    viewBox: [79, 97],
    primitives: [
      chair({ kind: "rect", x: 19, y: 3, width: 41, height: 11, rx: 3, strokeWidth: 1.5 }),
      surface({ kind: "rect", x: 4, y: 14, width: 71, height: 69, rx: 5, strokeWidth: 2 }),
      chair({ kind: "rect", x: 19, y: 83, width: 41, height: 11, rx: 3, strokeWidth: 1.5 }),
    ],
  },
  "square-4": {
    viewBox: [97, 97],
    primitives: [
      chair({ kind: "rect", x: 29, y: 1, width: 39, height: 11, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 29, y: 85, width: 39, height: 11, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 1, y: 29, width: 11, height: 39, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 85, y: 29, width: 11, height: 39, rx: 3, strokeWidth: 1.5 }),
      surface({ kind: "rect", x: 12, y: 12, width: 73, height: 73, rx: 6, strokeWidth: 2 }),
    ],
  },
  "rectangle-4": {
    viewBox: [140, 90],
    primitives: [
      chair({ kind: "rect", x: 30, y: 3, width: 32, height: 12, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 78, y: 3, width: 32, height: 12, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 30, y: 75, width: 32, height: 12, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 78, y: 75, width: 32, height: 12, rx: 3, strokeWidth: 1 }),
      surface({
        kind: "rect", x: 20, y: 15, width: 100, height: 60, rx: 8, strokeWidth: 1.5,
        fillOpacityDark: 0.18, fillOpacityLight: 0.28,
        strokeOpacityDark: 0.5, strokeOpacityLight: 0.6,
      }),
    ],
  },
  "rectangle-6": {
    viewBox: [180, 90],
    primitives: [
      chair({ kind: "rect", x: 30, y: 3, width: 32, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 74, y: 3, width: 32, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 118, y: 3, width: 32, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 30, y: 75, width: 32, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 74, y: 75, width: 32, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 118, y: 75, width: 32, height: 12, rx: 3, strokeWidth: 1.5 }),
      surface({
        kind: "rect", x: 20, y: 15, width: 140, height: 60, rx: 8, strokeWidth: 2,
        fillOpacityDark: 0.18, fillOpacityLight: 0.15,
        strokeOpacityDark: 0.5, strokeOpacityLight: 0.8,
      }),
    ],
  },
  "square-8": {
    viewBox: [208, 97],
    primitives: [
      chair({ kind: "rect", x: 28, y: 1, width: 40, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 84, y: 1, width: 40, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 140, y: 1, width: 40, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 28, y: 84, width: 40, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 84, y: 84, width: 40, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 140, y: 84, width: 40, height: 12, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 1, y: 29, width: 12, height: 39, rx: 3, strokeWidth: 1.5 }),
      chair({ kind: "rect", x: 195, y: 29, width: 12, height: 39, rx: 3, strokeWidth: 1.5 }),
      surface({ kind: "rect", x: 13, y: 13, width: 182, height: 71, rx: 6, strokeWidth: 2 }),
    ],
  },
  "circle-2": {
    viewBox: [100, 100],
    primitives: [
      chair({ kind: "rect", x: 36, y: 4, width: 28, height: 12, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 36, y: 84, width: 28, height: 12, rx: 3, strokeWidth: 1 }),
      surface({
        kind: "circle", cx: 50, cy: 50, r: 31, strokeWidth: 1.5,
        fillOpacityDark: 0.18, fillOpacityLight: 0.28,
      }),
    ],
  },
  "circle-4": {
    viewBox: [90, 90],
    primitives: [
      chair({ kind: "rect", x: 31, y: 3, width: 28, height: 14, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 31, y: 73, width: 28, height: 14, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 3, y: 31, width: 14, height: 28, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 73, y: 31, width: 14, height: 28, rx: 3, strokeWidth: 1 }),
      surface({
        kind: "circle", cx: 45, cy: 45, r: 28, strokeWidth: 1.5,
        fillOpacityDark: 0.18, fillOpacityLight: 0.28,
        strokeOpacityDark: 0.5, strokeOpacityLight: 0.6,
      }),
    ],
  },
  "circle-6": {
    viewBox: [150, 150],
    primitives: [
      ...CIRCLE6_CHAIRS,
      surface({
        kind: "circle", cx: 75, cy: 75, r: 41, strokeWidth: 2,
        fillOpacityDark: 0.18, fillOpacityLight: 0.15,
        strokeOpacityDark: 0.5, strokeOpacityLight: 0.8,
      }),
    ],
  },
  "high-top-2": {
    viewBox: [80, 80],
    primitives: [
      surface({
        kind: "circle", cx: 40, cy: 40, r: 36, strokeWidth: 1.5,
        fillOpacityDark: 0.18, fillOpacityLight: 0.28,
        strokeOpacityDark: 0.5, strokeOpacityLight: 0.6,
      }),
      // Overhang ring — stroke only.
      surface({
        kind: "circle", cx: 40, cy: 40, r: 28, strokeWidth: 0.75, noFill: true,
        fillOpacityDark: 0, fillOpacityLight: 0,
        strokeOpacityDark: 0.25, strokeOpacityLight: 0.35,
      }),
      // Pedestal base.
      surface({
        kind: "circle", cx: 40, cy: 40, r: 9, strokeWidth: 1,
        fillOpacityDark: 0.22, fillOpacityLight: 0.32,
        strokeOpacityDark: 0.5, strokeOpacityLight: 0.6,
      }),
    ],
  },
  "booth-2": {
    viewBox: [180, 80],
    primitives: [
      surface({
        kind: "rect", x: 6, y: 16, width: 168, height: 48, rx: 4, strokeWidth: 1.5,
        fillOpacityDark: 0.18, fillOpacityLight: 0.28,
      }),
      chair({ kind: "rect", x: 6, y: 0, width: 168, height: 13, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 6, y: 67, width: 168, height: 13, rx: 3, strokeWidth: 1 }),
    ],
  },
  "booth-4": {
    viewBox: [200, 100],
    primitives: [
      surface({
        kind: "rect", x: 6, y: 24, width: 188, height: 52, rx: 6, strokeWidth: 1.5,
        fillOpacityDark: 0.18, fillOpacityLight: 0.28,
      }),
      chair({ kind: "rect", x: 6, y: 0, width: 188, height: 16, rx: 3, strokeWidth: 1 }),
      chair({ kind: "rect", x: 6, y: 84, width: 188, height: 16, rx: 3, strokeWidth: 1 }),
    ],
  },
};

export const getTableShapeGeometry = (
  shapeId: string,
): ShapeGeometry | undefined => TABLE_SHAPE_GEOMETRY[shapeId];
