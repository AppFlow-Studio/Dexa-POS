/**
 * Skia floor-plan memory: TableDataPublisher intentionally never clearData's on
 * unmount (avoids a pan/viewport flicker), so tableDrawStore.pruneData is the
 * authoritative GC — TableLayoutView calls it with the current floor's full id
 * set. Without it `data` grew one entry per distinct table ever windowed and the
 * single SkiaTableLayer subscriber shallow-compared an ever-growing map.
 */
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
