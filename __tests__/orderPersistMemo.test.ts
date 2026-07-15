/**
 * W1-1: shallowSliceEqual + memoizePersistedSlice unit contract.
 *
 * The memo returns the CACHED slice reference only when every ref/value it
 * would serialize is identical (payload provably byte-identical). Gate OFF
 * = shadow mode: compare still runs (would_skip counter) but the fresh
 * object is always returned — pre-W1-1 behavior.
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
  KEY_PERSIST_MEMO_HIT,
  KEY_PERSIST_MEMO_MISS,
  KEY_PERSIST_MEMO_WOULD_SKIP,
} from "@/lib/telemetry/keys";
import { recordCount } from "@/lib/telemetry/registry";
import {
  _resetPersistMemoForTests,
  memoizePersistedSlice,
  shallowSliceEqual,
  type PersistedOrderSlice,
} from "@/stores/orderPersistMemo";

const ORDER_A = { id: "a", total: 10 };
const ORDER_B = { id: "b", total: 20 };
const WS: string[] = [];
const UNSYNCED: string[] = [];

const makeSlice = (
  over: Partial<PersistedOrderSlice> = {},
): PersistedOrderSlice => ({
  ordersById: { a: ORDER_A },
  orderIds: ["a"],
  activeOrderId: "a",
  workingSetOrderIds: WS,
  unsyncedOrderIds: UNSYNCED,
  currentLocationId: "loc-1",
  ...over,
});

beforeEach(() => {
  _resetPersistMemoForTests();
  mockGateOn = true;
  (recordCount as jest.Mock).mockClear();
});

describe("shallowSliceEqual", () => {
  it("is true for distinct wrappers with identical refs/values", () => {
    expect(shallowSliceEqual(makeSlice(), makeSlice())).toBe(true);
  });

  it("is false when an order value ref changes", () => {
    expect(
      shallowSliceEqual(makeSlice(), makeSlice({ ordersById: { a: { ...ORDER_A } } })),
    ).toBe(false);
  });

  it("is false when a key is added or removed", () => {
    expect(
      shallowSliceEqual(
        makeSlice(),
        makeSlice({ ordersById: { a: ORDER_A, b: ORDER_B }, orderIds: ["a", "b"] }),
      ),
    ).toBe(false);
    expect(
      shallowSliceEqual(makeSlice(), makeSlice({ ordersById: {}, orderIds: [] })),
    ).toBe(false);
  });

  it("is false when orderIds order changes", () => {
    const base = makeSlice({
      ordersById: { a: ORDER_A, b: ORDER_B },
      orderIds: ["a", "b"],
    });
    const swapped = makeSlice({
      ordersById: { a: ORDER_A, b: ORDER_B },
      orderIds: ["b", "a"],
    });
    expect(shallowSliceEqual(base, swapped)).toBe(false);
  });

  it("is false on scalar change", () => {
    expect(shallowSliceEqual(makeSlice(), makeSlice({ activeOrderId: "b" }))).toBe(false);
    expect(
      shallowSliceEqual(makeSlice(), makeSlice({ currentLocationId: null })),
    ).toBe(false);
  });

  it("is false when a state array ref changes (Immer would only swap it on mutation)", () => {
    expect(
      shallowSliceEqual(makeSlice(), makeSlice({ unsyncedOrderIds: [] })),
    ).toBe(false);
    expect(
      shallowSliceEqual(makeSlice(), makeSlice({ workingSetOrderIds: [] })),
    ).toBe(false);
  });
});

describe("memoizePersistedSlice — gate ON", () => {
  it("returns the cached reference for unchanged content, fresh on change", () => {
    const first = makeSlice();
    expect(memoizePersistedSlice(first)).toBe(first);
    expect(recordCount).toHaveBeenLastCalledWith(KEY_PERSIST_MEMO_MISS);

    const second = makeSlice(); // distinct wrapper, identical content
    expect(memoizePersistedSlice(second)).toBe(first); // cached ref
    expect(recordCount).toHaveBeenLastCalledWith(KEY_PERSIST_MEMO_HIT);

    const changed = makeSlice({ ordersById: { a: { ...ORDER_A } } });
    expect(memoizePersistedSlice(changed)).toBe(changed);
    expect(recordCount).toHaveBeenLastCalledWith(KEY_PERSIST_MEMO_MISS);

    // Cache now points at `changed` — equal content returns it.
    const afterChange = makeSlice({ ordersById: changed.ordersById });
    expect(memoizePersistedSlice(afterChange)).toBe(changed);
  });
});

describe("memoizePersistedSlice — gate OFF (shadow mode)", () => {
  it("always returns the fresh object but counts the would-skip", () => {
    mockGateOn = false;
    const first = makeSlice();
    expect(memoizePersistedSlice(first)).toBe(first);

    const second = makeSlice();
    expect(memoizePersistedSlice(second)).toBe(second); // fresh, NOT cached
    expect(recordCount).toHaveBeenLastCalledWith(KEY_PERSIST_MEMO_WOULD_SKIP);
  });

  it("flag flip OFF→ON serves the freshest cache, never a stale one", () => {
    mockGateOn = false;
    memoizePersistedSlice(makeSlice());
    const offModeLatest = makeSlice();
    memoizePersistedSlice(offModeLatest); // cache updated even while OFF

    mockGateOn = true;
    const postFlip = makeSlice();
    // Equal content → returns the cache, which is the LATEST off-mode slice.
    expect(memoizePersistedSlice(postFlip)).toBe(offModeLatest);
  });
});
