/**
 * W1-1: the memoized partialize exercised through the REAL middleware stack
 * used by useOrderStore — subscribeWithSelector(persist(immer(...))) — with a
 * fake PersistStorage recording each setItem's `value.state` reference.
 *
 * Locks in the load-bearing behaviors:
 *  - in-subset mutation → new slice ref (write arms)
 *  - out-of-subset merge (remote broadcast shape) → SAME slice ref (skip)
 *  - non-persisted-field set → same ref (skip)
 *  - external store.setState is covered (persist's setItem still fires and
 *    the memo sees the post-set state)
 *  - gate OFF → fresh ref on every set (pre-W1-1 behavior)
 */

let mockGateOn = true;
jest.mock("@/lib/network/featureFlags", () => ({
  isPersistMemoEnabled: jest.fn(() => mockGateOn),
}));

jest.mock("@/lib/telemetry/registry", () => {
  let n = 0;
  return {
    internKey: jest.fn(() => n++),
    recordCount: jest.fn(),
    recordSample: jest.fn(),
  };
});

import {
  _resetPersistMemoForTests,
  memoizePersistedSlice,
} from "@/stores/orderPersistMemo";
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

function makeStore() {
  const persistedRefs: unknown[] = [];
  const fakeStorage = {
    getItem: () => null,
    setItem: (_name: string, value: { state: unknown }) => {
      persistedRefs.push(value.state);
    },
    removeItem: () => {},
  };

  const useTestStore = create<any>()(
    subscribeWithSelector(
      persist(
        immer((set: any) => ({
          ordersById: {} as Record<string, { name: string }>,
          orderIds: [] as string[],
          activeOrderId: null as string | null,
          workingSetOrderIds: [] as string[],
          unsyncedOrderIds: [] as string[],
          currentLocationId: "loc-1" as string | null,
          persistableOrderIds: {} as Record<string, true>,
          scratch: 0,
          addPersistable: (id: string, name: string) =>
            set((s: any) => {
              s.ordersById[id] = { name };
              s.persistableOrderIds[id] = true;
            }),
          mutateOrder: (id: string, name: string) =>
            set((s: any) => {
              s.ordersById[id].name = name;
            }),
          // Remote-merge shape: writes ordersById only — an order OUTSIDE the
          // persisted subset (mirrors upsertOrder / in-place broadcast merge).
          mergeRemote: (id: string, name: string) =>
            set((s: any) => {
              s.ordersById[id] = { name };
            }),
          bumpScratch: () =>
            set((s: any) => {
              s.scratch++;
            }),
        })),
        {
          name: "test-memo-store",
          storage: fakeStorage as any,
          // Mirror of useOrderStore's partialize body + memo wrap.
          partialize: (state: any) => {
            const filteredOrdersById: Record<string, unknown> = {};
            const filteredOrderIds: string[] = [];
            for (const id of Object.keys(state.persistableOrderIds)) {
              if (state.ordersById[id]) {
                filteredOrdersById[id] = state.ordersById[id];
                filteredOrderIds.push(id);
              }
            }
            const extras = [
              ...(state.activeOrderId ? [state.activeOrderId] : []),
              ...state.workingSetOrderIds,
              ...state.unsyncedOrderIds,
            ];
            for (const id of extras) {
              if (state.ordersById[id] && !filteredOrdersById[id]) {
                filteredOrdersById[id] = state.ordersById[id];
                filteredOrderIds.push(id);
              }
            }
            return memoizePersistedSlice({
              ordersById: filteredOrdersById,
              orderIds: filteredOrderIds,
              activeOrderId: state.activeOrderId,
              workingSetOrderIds: state.workingSetOrderIds,
              unsyncedOrderIds: state.unsyncedOrderIds,
              currentLocationId: state.currentLocationId,
            }) as any;
          },
        },
      ),
    ),
  );

  return { useTestStore, persistedRefs };
}

beforeEach(() => {
  _resetPersistMemoForTests();
  mockGateOn = true;
});

describe("persist memo through the real middleware stack", () => {
  it("arms on in-subset mutations, skips on out-of-subset merges", () => {
    const { useTestStore, persistedRefs } = makeStore();
    const s = useTestStore.getState();

    s.addPersistable("x", "a");
    expect(persistedRefs).toHaveLength(1);

    s.mutateOrder("x", "b");
    expect(persistedRefs).toHaveLength(2);
    expect(persistedRefs[1]).not.toBe(persistedRefs[0]); // armed

    // Remote merge of an order NOT in the persisted subset: persist's setItem
    // still fires, but the memo returns the cached slice ref → the storage
    // identity skip downstream would swallow it.
    s.mergeRemote("y", "remote-1");
    expect(persistedRefs).toHaveLength(3);
    expect(persistedRefs[2]).toBe(persistedRefs[1]); // same ref → skip

    s.mergeRemote("y", "remote-2");
    expect(persistedRefs[3]).toBe(persistedRefs[1]);
  });

  it("skips sets that touch only non-persisted fields", () => {
    const { useTestStore, persistedRefs } = makeStore();
    const s = useTestStore.getState();
    s.addPersistable("x", "a");
    const armed = persistedRefs[persistedRefs.length - 1];

    s.bumpScratch();
    expect(persistedRefs[persistedRefs.length - 1]).toBe(armed);
  });

  it("covers external store.setState (no creator-set involved)", () => {
    const { useTestStore, persistedRefs } = makeStore();
    useTestStore.getState().addPersistable("x", "a");
    const before = persistedRefs[persistedRefs.length - 1];

    // External mutation of an in-subset order — the exact pattern of the ~30
    // useOrderStore.setState call sites across the app.
    useTestStore.setState((d: any) => {
      d.ordersById.x.name = "external";
    });
    const after = persistedRefs[persistedRefs.length - 1];
    expect(after).not.toBe(before); // armed — external setState is covered

    // External no-op-for-the-slice mutation skips.
    useTestStore.setState((d: any) => {
      d.scratch = 99;
    });
    expect(persistedRefs[persistedRefs.length - 1]).toBe(after);
  });

  it("gate OFF returns a fresh slice on every set (pre-W1-1 behavior)", () => {
    mockGateOn = false;
    const { useTestStore, persistedRefs } = makeStore();
    const s = useTestStore.getState();

    s.addPersistable("x", "a");
    s.mergeRemote("y", "remote-1"); // would skip when gated ON
    const [first, second] = persistedRefs.slice(-2);
    expect(second).not.toBe(first); // fresh object → always arms
  });
});
