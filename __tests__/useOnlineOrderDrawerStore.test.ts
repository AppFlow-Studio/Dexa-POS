/**
 * useOnlineOrderDrawerStore — seen-set semantics for the right-edge online
 * orders tab/drawer.
 *
 * Covers: openDrawer REPLACES the seen map with the active keys (mark-all +
 * prune in one write), markManySeen is additive and reference-stable when
 * nothing is new (the no-op guard prevents render loops with the drawer's
 * arrival-watch effect), closeDrawer keeps the seen set, and isOpen is
 * excluded from persistence.
 */
import { useOnlineOrderDrawerStore } from "@/stores/useOnlineOrderDrawerStore";

beforeEach(() => {
  useOnlineOrderDrawerStore.setState({ isOpen: false, seenOrderIds: {} });
});

describe("useOnlineOrderDrawerStore", () => {
  it("openDrawer opens and marks all active keys seen", () => {
    useOnlineOrderDrawerStore.getState().openDrawer(["a", "b"]);
    const s = useOnlineOrderDrawerStore.getState();
    expect(s.isOpen).toBe(true);
    expect(s.seenOrderIds).toEqual({ a: true, b: true });
  });

  it("openDrawer replaces the seen map — stale keys are pruned", () => {
    useOnlineOrderDrawerStore.setState({
      seenOrderIds: { stale: true, a: true },
    });
    useOnlineOrderDrawerStore.getState().openDrawer(["a", "b"]);
    expect(useOnlineOrderDrawerStore.getState().seenOrderIds).toEqual({
      a: true,
      b: true,
    });
  });

  it("closeDrawer closes but keeps the seen set", () => {
    useOnlineOrderDrawerStore.getState().openDrawer(["a"]);
    useOnlineOrderDrawerStore.getState().closeDrawer();
    const s = useOnlineOrderDrawerStore.getState();
    expect(s.isOpen).toBe(false);
    expect(s.seenOrderIds).toEqual({ a: true });
  });

  it("toggleDrawer opens when closed and closes when open", () => {
    useOnlineOrderDrawerStore.getState().toggleDrawer(["a"]);
    expect(useOnlineOrderDrawerStore.getState().isOpen).toBe(true);
    expect(useOnlineOrderDrawerStore.getState().seenOrderIds).toEqual({
      a: true,
    });
    useOnlineOrderDrawerStore.getState().toggleDrawer(["a", "b"]);
    const s = useOnlineOrderDrawerStore.getState();
    expect(s.isOpen).toBe(false);
    // Close path must not touch the seen set.
    expect(s.seenOrderIds).toEqual({ a: true });
  });

  it("markManySeen adds only new keys, keeping existing ones", () => {
    useOnlineOrderDrawerStore.getState().openDrawer(["a"]);
    useOnlineOrderDrawerStore.getState().markManySeen(["a", "b", "c"]);
    expect(useOnlineOrderDrawerStore.getState().seenOrderIds).toEqual({
      a: true,
      b: true,
      c: true,
    });
  });

  it("markManySeen no-ops (same reference) when every key is already seen", () => {
    useOnlineOrderDrawerStore.getState().openDrawer(["a", "b"]);
    const before = useOnlineOrderDrawerStore.getState().seenOrderIds;
    useOnlineOrderDrawerStore.getState().markManySeen(["a", "b"]);
    expect(useOnlineOrderDrawerStore.getState().seenOrderIds).toBe(before);
  });

  it("markManySeen with empty array is a no-op", () => {
    const before = useOnlineOrderDrawerStore.getState().seenOrderIds;
    useOnlineOrderDrawerStore.getState().markManySeen([]);
    expect(useOnlineOrderDrawerStore.getState().seenOrderIds).toBe(before);
  });

  it("persists seenOrderIds but NOT isOpen", () => {
    useOnlineOrderDrawerStore.getState().openDrawer(["a"]);
    const options = (useOnlineOrderDrawerStore as any).persist.getOptions();
    const persisted = options.partialize(
      useOnlineOrderDrawerStore.getState(),
    );
    expect(persisted).toEqual({ seenOrderIds: { a: true } });
    expect("isOpen" in persisted).toBe(false);
  });
});
