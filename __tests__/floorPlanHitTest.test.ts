import { hitTestTables } from "@/lib/floorPlanHitTest";
import { FloorPlanObject } from "@/types/db-floor-plan-types";

/**
 * Hit-testing must mirror how tables are actually drawn: rotation happens about
 * the table's CENTER (RN transform-origin default in ReadonlyTable, explicit
 * center translate in SkiaTable) — not about the top-left corner.
 */

const makeTable = (overrides: Partial<FloorPlanObject>): FloorPlanObject =>
  ({
    id: "t1",
    shape_id: "rectangle-4",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    z_index: 0,
    ...overrides,
  }) as FloorPlanObject;

describe("hitTestTables", () => {
  it("hits inside and misses outside an unrotated table", () => {
    const t = makeTable({});
    expect(hitTestTables(100, 50, [t])?.id).toBe("t1");
    expect(hitTestTables(210, 50, [t])).toBeNull();
    expect(hitTestTables(100, 110, [t])).toBeNull();
  });

  it("hits a 90°-rotated table inside its ROTATED footprint", () => {
    // 200×100 at origin rotated 90° about its center (100,50):
    // footprint becomes x∈[50,150], y∈[-50,150].
    const t = makeTable({ rotation: 90 });
    // Inside the rotated footprint but OUTSIDE the unrotated box — a
    // corner-pivot hit test (the old bug) misses this point.
    expect(hitTestTables(60, -40, [t])?.id).toBe("t1");
    // Inside the unrotated box but outside the rotated footprint — must miss.
    expect(hitTestTables(190, 90, [t])).toBeNull();
    // Center is invariant under rotation — always hits.
    expect(hitTestTables(100, 50, [t])?.id).toBe("t1");
  });

  it("treats a 180° rotation as the same footprint as unrotated", () => {
    const t = makeTable({ rotation: 180 });
    expect(hitTestTables(1, 1, [t])?.id).toBe("t1");
    expect(hitTestTables(199, 99, [t])?.id).toBe("t1");
    expect(hitTestTables(-1, 50, [t])).toBeNull();
  });

  it("hits a 45°-rotated square only within the rotated diamond corners", () => {
    // 100×100 at origin, center (50,50), rotated 45°: the original corner
    // (0,0) moves away, so a point near the box corner is now outside.
    const t = makeTable({ width: 100, height: 100, rotation: 45 });
    expect(hitTestTables(2, 2, [t])).toBeNull();
    // Rotated footprint extends past the box edge at the middle.
    expect(hitTestTables(50, -15, [t])?.id).toBe("t1");
  });

  it("returns the topmost table by z_index on overlap", () => {
    const bottom = makeTable({ id: "bottom", z_index: 0 });
    const top = makeTable({ id: "top", z_index: 5 });
    expect(hitTestTables(100, 50, [bottom, top])?.id).toBe("top");
  });
});
