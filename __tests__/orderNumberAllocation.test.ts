/**
 * Order numbering — every way an order can be born, and the number it gets.
 *
 * The report this covers: "create order 1 and send it to the kitchen, create
 * order 2, pay order 1, press New Order — you get order 3 and there is no way
 * to reach order 2." Two separate defects produced that, and both are asserted
 * below:
 *
 *   1. The in-process counter cache was read-preferred but only written by the
 *      minting path, so every "heal the counter back to N" call in the app was
 *      inert after the first order of the session. The reused-empty-draft path
 *      then fell through to `cached + 1` and issued a BRAND NEW number instead
 *      of handing the draft back its own — stranding #2 and showing #3.
 *
 *   2. The floor a fresh order was allocated from skipped empty drafts, so it
 *      could sit BELOW a number a draft on screen was still displaying.
 */
import {
    __resetLocalSequencesForTests,
    forceSetLocalSequence,
    generateLocalOrderNumbers,
    parseSequenceFromDisplayNumber,
    seedLocalSequence,
} from "@/lib/localOrderSequence";
import {
    allocateOrderNumbers,
    findLatestReusableEmptyDraftId,
    getTodaySequenceFloor,
    isReusableEmptyDraftOrder,
} from "@/lib/reusableEmptyDraft";
import type { OrderProfile } from "@/lib/types";

const LOCATION = "loc-1";
const STATION = 1;

function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** A store shaped like useOrderStore's, small enough to reason about. */
function makeStore() {
  const ordersById: Record<string, OrderProfile> = {};
  const orderIds: string[] = [];

  const add = (order: Partial<OrderProfile> & { id: string }) => {
    const full = {
      service_location_id: null,
      order_status: "draft",
      check_status: "Opened",
      paid_status: "Unpaid",
      order_type: "takeout",
      items: [],
      payments: [],
      opened_at: new Date().toISOString(),
      customer_name: "",
      total_amount: 0,
      amount_due: 0,
      cash_amount_due: 0,
      amount_paid: 0,
      station_id: "station-1",
      ...order,
    } as unknown as OrderProfile;
    ordersById[full.id] = full;
    orderIds.push(full.id);
    return full;
  };

  /** What `startNewOrder` does: allocate against what the store can see. */
  const startNewOrder = (overrides: Partial<OrderProfile> = {}) => {
    const numbers = allocateOrderNumbers({
      ordersById,
      orderIds,
      locationId: LOCATION,
      stationNumber: STATION,
    });
    return add({
      id: `o${orderIds.length + 1}`,
      order_number: numbers.orderNumber,
      display_number: numbers.displayNumber,
      ...overrides,
    });
  };

  /** What `startOrResumeOrder` does: resume a draft, else mint. */
  const startOrResumeOrder = (excludeOrderId: string | null = null) => {
    const reusableId = findLatestReusableEmptyDraftId(
      ordersById,
      orderIds,
      excludeOrderId,
      "station-1",
    );
    if (reusableId) return ordersById[reusableId];
    return startNewOrder();
  };

  return { ordersById, orderIds, add, startNewOrder, startOrResumeOrder };
}

const seq = (order: OrderProfile) =>
  parseSequenceFromDisplayNumber(order.display_number);

beforeEach(() => {
  __resetLocalSequencesForTests();
});

describe("the reported scenario", () => {
  it("resumes the untouched second order instead of skipping to a third", () => {
    const store = makeStore();

    // 1. Ring order #1 and send it to the kitchen.
    const first = store.startNewOrder();
    expect(seq(first)).toBe(1);
    first.items = [{ id: "i1" } as any];
    first.order_status = "preparing" as OrderProfile["order_status"];
    first.total_amount = 12;

    // 2. New Order → #2, left empty.
    const second = store.startOrResumeOrder(first.id);
    expect(seq(second)).toBe(2);

    // 3. Pay order #1.
    first.paid_status = "Paid";
    first.check_status = "Closed";
    first.order_status = "completed" as OrderProfile["order_status"];

    // 4. New Order again → must land back on #2, not mint #3.
    const next = store.startOrResumeOrder(first.id);
    expect(next.id).toBe(second.id);
    expect(seq(next)).toBe(2);
    expect(store.orderIds).toHaveLength(2);

    // 5. Only once #2 is actually rung does the next order become #3.
    second.items = [{ id: "i2" } as any];
    second.total_amount = 8;
    const third = store.startOrResumeOrder(second.id);
    expect(seq(third)).toBe(3);
  });

  it("never renumbers a draft it resumes", () => {
    const store = makeStore();
    const first = store.startNewOrder();
    first.items = [{ id: "i1" } as any];
    const draft = store.startOrResumeOrder(first.id);
    const bornAs = draft.display_number;

    // Resuming repeatedly — screen mount, post-payment hand-off, New Order —
    // must be free. The number is already in SQLite and in the outbox op.
    store.startOrResumeOrder(first.id);
    store.startOrResumeOrder(null);
    store.startOrResumeOrder(first.id);

    expect(draft.display_number).toBe(bornAs);
    expect(store.orderIds).toHaveLength(2);
  });
});

describe("a fresh number is never one an order on this device already holds", () => {
  it("counts empty drafts toward the floor", () => {
    const store = makeStore();
    // An abandoned empty draft holding #4 (its owner navigated away).
    store.add({
      id: "abandoned",
      order_number: `ORD-${todayKey()}-S1-0004`,
      display_number: "#S1-0004",
    });

    // The counter itself knows nothing (fresh install / cleared MMKV).
    const minted = store.startNewOrder();
    expect(seq(minted)).toBe(5);
  });

  it("recovers when the counter is wiped mid-session", () => {
    const store = makeStore();
    store.startNewOrder();
    store.startNewOrder();
    const third = store.startNewOrder();
    expect(seq(third)).toBe(3);

    // MMKV bucket cleared underneath us — the only thing left is the store.
    __resetLocalSequencesForTests();

    const afterWipe = store.startNewOrder();
    expect(seq(afterWipe)).toBe(4);
  });

  it("keeps another station's numbering out of ours", () => {
    const store = makeStore();
    store.add({
      id: "s2-order",
      station_id: "station-2",
      order_number: `ORD-${todayKey()}-S2-0009`,
      display_number: "#S2-0009",
    });

    expect(
      getTodaySequenceFloor(store.ordersById, store.orderIds, STATION),
    ).toBe(0);
    expect(seq(store.startNewOrder())).toBe(1);
  });

  it("keeps yesterday's numbering out of today's", () => {
    const store = makeStore();
    store.add({
      id: "yesterday",
      order_number: `ORD-${todayKey(-1)}-S1-0119`,
      display_number: "#S1-0119",
      opened_at: new Date(Date.now() - 86_400_000).toISOString(),
    });

    expect(seq(store.startNewOrder())).toBe(1);
  });

  it("seeds today's counter from today's floor, not from old open orders", () => {
    // initializeOrders REGRESSION: its seed loop used to count every open
    // order the fetch returned (station-filtered only, no day check). A table
    // left open from a previous service day — #S1-0076, born yesterday —
    // force-lifted TODAY's counter to 76, so the next order came out 77 even
    // though the operator was only on #24. The seed must use the same
    // day-aware floor as the mint path.
    const store = makeStore();

    // What the store looks like right after an initializeOrders fetch+merge:
    // today's active orders PLUS old open tables from prior days.
    store.add({
      id: "old-open-table",
      service_location_id: "table-4",
      order_status: "sent_to_kitchen" as OrderProfile["order_status"],
      order_number: `ORD-${todayKey(-1)}-S1-0076`,
      display_number: "#S1-0076",
      opened_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    store.add({
      id: "today-active",
      order_status: "draft" as OrderProfile["order_status"],
      order_number: `ORD-${todayKey()}-S1-0024`,
      display_number: "#S1-0024",
    });

    const seedValue = getTodaySequenceFloor(
      store.ordersById,
      store.orderIds,
      STATION,
    );
    expect(seedValue).toBe(24);

    // Cleared MMKV — the seed is the only thing protecting the sequence.
    __resetLocalSequencesForTests();
    seedLocalSequence(LOCATION, STATION, seedValue);

    const next = store.startNewOrder();
    expect(seq(next)).toBe(25);
  });
});

describe("stale drafts", () => {
  it("does not resume a draft carrying yesterday's number", () => {
    const stale = {
      id: "stale",
      service_location_id: null,
      order_status: "draft",
      paid_status: "Unpaid",
      items: [],
      payments: [],
      customer_name: "",
      total_amount: 0,
      amount_due: 0,
      cash_amount_due: 0,
      amount_paid: 0,
      station_id: "station-1",
      order_number: `ORD-${todayKey(-1)}-S1-0007`,
      display_number: "#S1-0007",
      opened_at: new Date(Date.now() - 86_400_000).toISOString(),
    } as unknown as OrderProfile;

    // Resuming it would either show yesterday's date on today's ticket or
    // force a local renumber the server never hears about.
    expect(isReusableEmptyDraftOrder(stale)).toBe(false);
  });

  it("still resumes an unnumbered draft — it has nothing stale to carry", () => {
    const unnumbered = {
      id: "unnumbered",
      service_location_id: null,
      order_status: "draft",
      paid_status: "Unpaid",
      items: [],
      payments: [],
      customer_name: "",
      total_amount: 0,
      amount_due: 0,
      cash_amount_due: 0,
      amount_paid: 0,
      station_id: "station-1",
      opened_at: new Date().toISOString(),
    } as unknown as OrderProfile;

    expect(isReusableEmptyDraftOrder(unnumbered)).toBe(true);
  });
});

describe("the counter cache and MMKV cannot disagree", () => {
  it("honours a seed taken after numbers have already been issued", () => {
    // REGRESSION: seedLocalSequence wrote MMKV only, while the mint path read
    // the in-process cache first — so every seed after the first order of the
    // session was silently discarded.
    generateLocalOrderNumbers(LOCATION, STATION); // #0001, cache now warm
    seedLocalSequence(LOCATION, STATION, 40);

    expect(generateLocalOrderNumbers(LOCATION, STATION).displayNumber).toBe(
      "#S1-0041",
    );
  });

  it("seeding never rewinds", () => {
    generateLocalOrderNumbers(LOCATION, STATION);
    generateLocalOrderNumbers(LOCATION, STATION);
    seedLocalSequence(LOCATION, STATION, 1);

    expect(generateLocalOrderNumbers(LOCATION, STATION).displayNumber).toBe(
      "#S1-0003",
    );
  });

  it("takes the server's word when the server assigned the number", () => {
    generateLocalOrderNumbers(LOCATION, STATION);
    // The legacy create path echoing back what the database minted.
    forceSetLocalSequence(LOCATION, STATION, 77);

    expect(generateLocalOrderNumbers(LOCATION, STATION).displayNumber).toBe(
      "#S1-0078",
    );
  });

  it("issues 25 distinct numbers in a row", () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 25; i++) {
      numbers.add(generateLocalOrderNumbers(LOCATION, STATION).orderNumber);
    }
    expect(numbers.size).toBe(25);
  });
});
