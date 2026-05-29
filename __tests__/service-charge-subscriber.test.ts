/**
 * Service-charge subscriber test.
 *
 * Verifies that a change to `table_sessions[t].party_size` triggers
 * `useOrderStore.recalculateOrder` for the linked order.
 */

jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/stores/useTableSessionStore", () => {
  const listeners: Array<{ selector: Function; cb: Function; equality?: Function }> = [];
  const state: { sessions: Record<string, any> } = { sessions: {} };
  const store = {
    getState: () => state,
    subscribe: (selector: Function, cb: Function, opts?: any) => {
      const entry = { selector, cb, equality: opts?.equalityFn };
      listeners.push(entry);
      return () => {
        const idx = listeners.indexOf(entry);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    _emit: () => {
      for (const { selector, cb, equality } of listeners) {
        const next = selector(state);
        const prev = (cb as any)._lastValue ?? {};
        if (!equality || !equality(next, prev)) {
          (cb as any)._lastValue = next;
          cb(next, prev);
        }
      }
    },
    _setSessions: (sessions: Record<string, any>) => {
      state.sessions = sessions;
    },
  };
  return { useTableSessionStore: store };
});

import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import {
  setupServiceChargeSubscriber,
  teardownServiceChargeSubscriber,
} from "@/services/serviceChargeSubscriber";

const flushMicrotasks = () => new Promise((r) => setImmediate(r));

describe("serviceChargeSubscriber", () => {
  let recalculateOrder: jest.Mock;

  beforeEach(() => {
    recalculateOrder = jest.fn();
    (useOrderStore.getState as jest.Mock).mockReturnValue({
      ordersById: {
        "local-1": { id: "local-1" },
      },
      dbOrderIdIndex: { "db-1": "local-1" },
      recalculateOrder,
    });
    (useTableSessionStore as any)._setSessions({});
    teardownServiceChargeSubscriber();
    setupServiceChargeSubscriber();
  });

  it("fires recalculateOrder when party_size changes", async () => {
    (useTableSessionStore as any)._setSessions({
      t1: { order_id: "db-1", party_size: 3 },
    });
    (useTableSessionStore as any)._emit();
    await flushMicrotasks();
    expect(recalculateOrder).toHaveBeenCalledWith("local-1");

    recalculateOrder.mockClear();
    (useTableSessionStore as any)._setSessions({
      t1: { order_id: "db-1", party_size: 5 },
    });
    (useTableSessionStore as any)._emit();
    await flushMicrotasks();
    expect(recalculateOrder).toHaveBeenCalledWith("local-1");
  });

  it("does not fire when party_size is unchanged", async () => {
    (useTableSessionStore as any)._setSessions({
      t1: { order_id: "db-1", party_size: 4 },
    });
    (useTableSessionStore as any)._emit();
    await flushMicrotasks();
    recalculateOrder.mockClear();

    // Re-emit with same value
    (useTableSessionStore as any)._emit();
    await flushMicrotasks();
    expect(recalculateOrder).not.toHaveBeenCalled();
  });

  it("skips when the order is not in the local store", async () => {
    (useTableSessionStore as any)._setSessions({
      t1: { order_id: "db-unknown", party_size: 4 },
    });
    (useTableSessionStore as any)._emit();
    await flushMicrotasks();
    expect(recalculateOrder).not.toHaveBeenCalled();
  });

  it("resolves db_order_id to local id via dbOrderIdIndex", async () => {
    (useTableSessionStore as any)._setSessions({
      t1: { order_id: "db-1", party_size: 5 },
    });
    (useTableSessionStore as any)._emit();
    await flushMicrotasks();
    expect(recalculateOrder).toHaveBeenCalledWith("local-1");
  });
});
