import { TABLE_SHAPES } from "@/lib/table-shapes";
import { FloorPlanObject } from "@/types/db-floor-plan-types";

/**
 * Pure hit-test for the single-surface Skia floor plan. When table shapes are drawn
 * on one Skia canvas there are no per-table native views to attach a GestureDetector
 * to, so tap/long-press is resolved at the canvas level: the tap point is converted
 * to world coordinates (inverse camera transform) and tested against each table's
 * box here.
 *
 * Iterates in reverse z-order so the topmost table wins on overlap. Rotation-aware:
 * a nonzero rotation transforms the world point into the table's local space.
 * Rotation is applied about the table's CENTER — RN view transforms use a center
 * transform-origin (ReadonlyTable) and SkiaTable explicitly translates to the
 * center before rotating — so the point is un-rotated about the center too.
 */
export const hitTestTables = (
  worldX: number,
  worldY: number,
  tables: FloorPlanObject[],
): FloorPlanObject | null => {
  // Reverse z-order (higher z_index drawn last / on top → test first).
  const ordered = [...tables].sort(
    (a, b) => (b.z_index ?? 0) - (a.z_index ?? 0),
  );

  for (const table of ordered) {
    const shapeDef = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
    const w = table.width ?? shapeDef?.width ?? 100;
    const h = table.height ?? shapeDef?.height ?? 100;

    // Point relative to the table's center (the rotation pivot).
    let localX = worldX - table.x - w / 2;
    let localY = worldY - table.y - h / 2;

    const rotation = table.rotation || 0;
    if (rotation !== 0) {
      // Undo the table's rotation (rotate the point by -rotation about the center).
      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rx = localX * cos - localY * sin;
      const ry = localX * sin + localY * cos;
      localX = rx;
      localY = ry;
    }

    if (Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2) {
      return table;
    }
  }

  return null;
};
