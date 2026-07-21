/**
 * Skia floor-plan memory: TableDataPublisher intentionally never clearData's on
 * unmount (avoids a pan/viewport flicker), so tableDrawStore.pruneData is the
 * authoritative GC — TableLayoutView calls it with the current floor's full id
 * set. Without it `data` grew one entry per distinct table ever windowed and the
 * single SkiaTableLayer subscriber shallow-compared an ever-growing map.
 */
import fs from "fs";
import path from "path";
import {
  TableDrawData,
  useTableDrawStore,
} from "@/components/tables/skia/tableDrawStore";

const mk = (shapeId: string): TableDrawData => ({
  shapeId,
  x: 0,
  y: 0,
  rotation: 0,
  width: 10,
  height: 10,
  color: "#fff",
  darkMode: false,
  attention: false,
  lines: [],
  badges: [],
});

describe("tableDrawStore.pruneData", () => {
  beforeEach(() => {
    useTableDrawStore.setState({ data: {} });
  });

  it("drops entries whose id is not in keepIds, retains the rest", () => {
    const store = useTableDrawStore.getState();
    store.setData("t1", mk("a"));
    store.setData("t2", mk("b"));
    store.setData("t3", mk("c"));

    store.pruneData(new Set(["t1", "t3"]));

    const data = useTableDrawStore.getState().data;
    expect(data.t1).toBeDefined();
    expect(data.t2).toBeUndefined();
    expect(data.t3).toBeDefined();
  });

  it("is a no-op (stable reference) when nothing needs pruning", () => {
    const store = useTableDrawStore.getState();
    store.setData("t1", mk("a"));
    const before = useTableDrawStore.getState().data;

    store.pruneData(new Set(["t1"]));

    // Same object identity → SkiaTableLayer's useShallow subscriber won't re-run.
    expect(useTableDrawStore.getState().data).toBe(before);
  });

  it("clears everything when keepIds is empty", () => {
    const store = useTableDrawStore.getState();
    store.setData("t1", mk("a"));
    store.setData("t2", mk("b"));

    store.pruneData(new Set());

    expect(Object.keys(useTableDrawStore.getState().data)).toHaveLength(0);
  });
});

describe("TableLayoutView prune guard — transiently-empty tables", () => {
  // Regression: on a WiFi drop the floor-plan store's `tables` array briefly
  // empties then refills with the SAME (identity-reused) objects. Pruning to an
  // empty keep-set wiped every draw-data entry, and it never recovered because
  // the unchanged `draw` memo meant no publisher re-published — the Skia canvas
  // stayed blank until a floor switch/remount. The prune effect must skip an
  // empty `tables` frame. (Only Skia mode has tableDrawStore, matching the report
  // that classic mode was unaffected.)
  const src = fs.readFileSync(
    path.join(process.cwd(), "components", "tables", "TableLayoutView.tsx"),
    "utf8",
  );

  it("early-returns from the prune effect before pruning when tables is empty", () => {
    const guardIdx = src.indexOf("if (tables.length === 0) return;");
    const pruneIdx = src.indexOf("pruneData(keep)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(pruneIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(pruneIdx);
  });
});
