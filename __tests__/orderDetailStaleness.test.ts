/**
 * W1-3: staleness-contract leaf module (stores/orderDetailStaleness.ts).
 *
 * Behavioral contract: mismatch on an out-of-working-scope order → marked
 * stale + suppression counted; working-scope membership honors working set,
 * active order (both key spaces), pending local changes, and the visible-
 * detail registration; clear is explicit (sync success / order removal).
 */

jest.mock("@/lib/telemetry/registry", () => {
  let n = 0;
  return {
    internKey: jest.fn(() => n++),
    recordCount: jest.fn(),
    recordSample: jest.fn(),
  };
});

import { KEY_RT_DETAIL_REFRESH_SUPPRESSED } from "@/lib/telemetry/keys";
import { recordCount } from "@/lib/telemetry/registry";
import {
  _resetDetailStalenessForTests,
  clearOrderDetailStale,
  isInLocalWorkingScope,
  isOrderDetailStale,
  markOrderDetailStale,
  registerVisibleOrderDetail,
  type WorkingScopeState,
} from "@/stores/orderDetailStaleness";

const emptyScope = (over: Partial<WorkingScopeState> = {}): WorkingScopeState => ({
  _workingSetLookup: {},
  activeOrderId: null,
  persistableOrderIds: {},
  ...over,
});

beforeEach(() => {
  _resetDetailStalenessForTests();
  (recordCount as jest.Mock).mockClear();
});

describe("mark / clear / isStale", () => {
  it("marks stale and counts the suppressed refresh", () => {
    expect(isOrderDetailStale("db-1")).toBe(false);
    markOrderDetailStale("db-1");
    expect(isOrderDetailStale("db-1")).toBe(true);
    expect(recordCount).toHaveBeenCalledWith(KEY_RT_DETAIL_REFRESH_SUPPRESSED);
  });

  it("counts every suppression (each is one avoided RPC cycle)", () => {
    markOrderDetailStale("db-1");
    markOrderDetailStale("db-1");
    markOrderDetailStale("db-2");
    expect(recordCount).toHaveBeenCalledTimes(3);
  });

  it("clear removes the flag; clearing an unknown id is a no-op", () => {
    markOrderDetailStale("db-1");
    clearOrderDetailStale("db-1");
    expect(isOrderDetailStale("db-1")).toBe(false);
    clearOrderDetailStale("never-marked"); // must not throw
  });
});

describe("isInLocalWorkingScope", () => {
  it("is false for an order nobody on this station touches", () => {
    expect(isInLocalWorkingScope(emptyScope(), "db-14", "db-14")).toBe(false);
  });

  it("true for working-set membership (keyed by db_order_id)", () => {
    const s = emptyScope({ _workingSetLookup: { "db-3": true } });
    expect(isInLocalWorkingScope(s, "db-3", "order_local3")).toBe(true);
  });

  it("true for the active order in either key space", () => {
    expect(
      isInLocalWorkingScope(
        emptyScope({ activeOrderId: "order_local3" }),
        "db-3",
        "order_local3",
      ),
    ).toBe(true);
    expect(
      isInLocalWorkingScope(
        emptyScope({ activeOrderId: "db-3" }),
        "db-3",
        "db-3",
      ),
    ).toBe(true);
  });

  it("true for orders with pending local changes (persistable) in either key space", () => {
    expect(
      isInLocalWorkingScope(
        emptyScope({ persistableOrderIds: { order_local3: true } }),
        "db-3",
        "order_local3",
      ),
    ).toBe(true);
    expect(
      isInLocalWorkingScope(
        emptyScope({ persistableOrderIds: { "db-3": true } }),
        "db-3",
        "db-3",
      ),
    ).toBe(true);
  });
});

describe("visible-detail registration", () => {
  it("registration makes the order working-scope; unregister reverts it", () => {
    const unregister = registerVisibleOrderDetail("db-9");
    expect(isInLocalWorkingScope(emptyScope(), "db-9", "db-9")).toBe(true);
    unregister();
    expect(isInLocalWorkingScope(emptyScope(), "db-9", "db-9")).toBe(false);
  });

  it("refcounts overlapping registrations", () => {
    const un1 = registerVisibleOrderDetail("db-9");
    const un2 = registerVisibleOrderDetail("db-9");
    un1();
    expect(isInLocalWorkingScope(emptyScope(), "db-9", "db-9")).toBe(true);
    un2();
    expect(isInLocalWorkingScope(emptyScope(), "db-9", "db-9")).toBe(false);
  });

  it("unregister is idempotent (double effect-cleanup can't underflow)", () => {
    const un1 = registerVisibleOrderDetail("db-9");
    const un2 = registerVisibleOrderDetail("db-9");
    un1();
    un1(); // duplicate call must not decrement again
    expect(isInLocalWorkingScope(emptyScope(), "db-9", "db-9")).toBe(true);
    un2();
    expect(isInLocalWorkingScope(emptyScope(), "db-9", "db-9")).toBe(false);
  });
});
