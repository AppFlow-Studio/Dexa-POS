/**
 * Convergence is a PROPERTY, so it is tested as one.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §11
 *
 * Example-based tests will not find the bug that killed the last attempt at
 * local-first writes. What matters is not "does this example merge correctly"
 * but "is the merge commutative, idempotent and associative for ALL inputs" —
 * because those three properties are exactly what make two devices reach the
 * same state without coordinating.
 *
 * The generators below are seeded and deterministic, so a failure reproduces
 * from the printed case rather than being a heisenbug in CI.
 */
import {
  compareVersion,
  mergeItem,
  mergeItemSets,
  mergeOrderHeader,
  mergeOrderStatus,
  mergeSession,
  mergeSessionStatus,
  mergeTableSets,
  pickNewer,
  type MergeableItem,
} from "@/lib/db/merge";

// ---------------------------------------------------------------------------
// Deterministic PRNG — a failing seed is reproducible.
// ---------------------------------------------------------------------------

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const DEVICES = ["dev-a", "dev-b", "dev-c"];

function randomItem(rng: () => number, id: string): MergeableItem {
  const voided = rng() < 0.25;
  return {
    id,
    quantity: 1 + Math.floor(rng() * 5),
    is_voided: voided,
    voided_at: voided ? new Date(Date.UTC(2026, 0, 1)).toISOString() : null,
    _lamport: Math.floor(rng() * 8),
    _device_id: DEVICES[Math.floor(rng() * DEVICES.length)],
    updated_at: new Date(Date.UTC(2026, 0, 1 + Math.floor(rng() * 5))).toISOString(),
  };
}

function randomItemSet(rng: () => number, ids: string[]): MergeableItem[] {
  return ids.filter(() => rng() < 0.75).map((id) => randomItem(rng, id));
}

const ALL_IDS = ["i1", "i2", "i3", "i4", "i5"];

// Stable structural comparison — key order must not affect equality.
function canon(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v,
  );
}

// ---------------------------------------------------------------------------

describe("compareVersion — a total, deterministic order", () => {
  it("prefers the higher lamport regardless of wall clock", () => {
    // The whole point: a device with a fast clock must not win on time.
    const slowClockNewerWrite = {
      _lamport: 9,
      _device_id: "a",
      updated_at: "2020-01-01T00:00:00.000Z",
    };
    const fastClockOlderWrite = {
      _lamport: 2,
      _device_id: "b",
      updated_at: "2099-01-01T00:00:00.000Z",
    };
    expect(pickNewer(slowClockNewerWrite, fastClockOlderWrite)).toBe(
      slowClockNewerWrite,
    );
  });

  it("breaks a lamport tie deterministically by device id", () => {
    const a = { _lamport: 5, _device_id: "aaa" };
    const b = { _lamport: 5, _device_id: "bbb" };
    // Antisymmetric: whichever way round you ask, the same one wins.
    expect(Math.sign(compareVersion(a, b))).toBe(-Math.sign(compareVersion(b, a)));
    expect(pickNewer(a, b)).toBe(pickNewer(b, a));
  });

  it("never reports two different versions as equal", () => {
    expect(compareVersion({ _lamport: 1, _device_id: "a" }, { _lamport: 1, _device_id: "b" })).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("item merge — properties over 2000 generated pairs", () => {
  it("is commutative", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const rng = makeRng(seed);
      const a = randomItem(rng, "i1");
      const b = randomItem(rng, "i1");
      expect({ seed, r: canon(mergeItem(a, b)) }).toEqual({
        seed,
        r: canon(mergeItem(b, a)),
      });
    }
  });

  it("is idempotent", () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = makeRng(seed);
      const a = randomItem(rng, "i1");
      expect(canon(mergeItem(a, a))).toEqual(canon(a));
    }
  });

  it("is associative — a three-way merge cannot depend on grouping", () => {
    // Regression guard for the seed-34 bug: the void branch used to build a
    // BLEND of both sides, so an intermediate merge produced an object equal
    // to neither input and the content tiebreak then resolved differently
    // depending on how the three were grouped.
    for (let seed = 0; seed < 2000; seed++) {
      const rng = makeRng(seed + 31_000);
      const a = randomItem(rng, "i1");
      const b = randomItem(rng, "i1");
      const c = randomItem(rng, "i1");
      expect({ seed, r: canon(mergeItem(mergeItem(a, b), c)) }).toEqual({
        seed,
        r: canon(mergeItem(a, mergeItem(b, c))),
      });
    }
  });

  it("always returns one of its inputs verbatim, never a blend", () => {
    // The structural property the associativity fix rests on. A merge that
    // invents a new object breaks the total order it is supposed to be a max
    // over, so this is worth asserting directly rather than only via its
    // consequence.
    for (let seed = 0; seed < 1000; seed++) {
      const rng = makeRng(seed + 61_000);
      const a = randomItem(rng, "i1");
      const b = randomItem(rng, "i1");
      const merged = canon(mergeItem(a, b));
      expect([canon(a), canon(b)]).toContain(merged);
    }
  });

  it("is remove-wins: a void survives any concurrent edit", () => {
    const live: MergeableItem = {
      id: "i1",
      quantity: 3,
      is_voided: false,
      _lamport: 999, // deliberately the NEWER write
      _device_id: "a",
    };
    const voided: MergeableItem = {
      id: "i1",
      quantity: 1,
      is_voided: true,
      voided_at: "2026-01-01T00:00:00.000Z",
      _lamport: 1, // older, and still wins
      _device_id: "b",
    };
    expect(mergeItem(live, voided).is_voided).toBe(true);
    expect(mergeItem(voided, live).is_voided).toBe(true);
  });

  it("treats quantity as absolute, never as a counter", () => {
    // Two devices each SET quantity to 2. Summing would charge the guest for 4.
    const a: MergeableItem = { id: "i1", quantity: 2, _lamport: 1, _device_id: "a" };
    const b: MergeableItem = { id: "i1", quantity: 2, _lamport: 2, _device_id: "b" };
    expect(mergeItem(a, b).quantity).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe("item SET merge — properties over 2000 generated pairs", () => {
  it("is commutative", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const rng = makeRng(seed);
      const a = randomItemSet(rng, ALL_IDS);
      const b = randomItemSet(rng, ALL_IDS);
      expect({ seed, r: canon(mergeItemSets(a, b)) }).toEqual({
        seed,
        r: canon(mergeItemSets(b, a)),
      });
    }
  });

  it("is associative", () => {
    for (let seed = 0; seed < 1000; seed++) {
      const rng = makeRng(seed + 50_000);
      const a = randomItemSet(rng, ALL_IDS);
      const b = randomItemSet(rng, ALL_IDS);
      const c = randomItemSet(rng, ALL_IDS);
      const left = mergeItemSets(mergeItemSets(a, b), c);
      const right = mergeItemSets(a, mergeItemSets(b, c));
      expect({ seed, r: canon(left) }).toEqual({ seed, r: canon(right) });
    }
  });

  it("is idempotent", () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = makeRng(seed + 90_000);
      const a = randomItemSet(rng, ALL_IDS);
      expect(canon(mergeItemSets(a, a))).toEqual(canon(mergeItemSets(a, [])));
    }
  });

  it("is add-wins: two stations offline both keep their items", () => {
    // The scenario from §9.5, at the item level. Losing either side's item is
    // a remake and a comped check.
    const stationA: MergeableItem[] = [
      { id: "burger", quantity: 1, _lamport: 3, _device_id: "a" },
    ];
    const stationB: MergeableItem[] = [
      { id: "fries", quantity: 2, _lamport: 3, _device_id: "b" },
    ];
    const merged = mergeItemSets(stationA, stationB);
    expect(merged.map((i) => i.id).sort()).toEqual(["burger", "fries"]);
  });

  it("produces a deterministic ORDER, not just a deterministic set", () => {
    // Equal sets in different orders would break commutativity for any
    // consumer that hashes or diffs the array.
    const a: MergeableItem[] = [
      { id: "z", _lamport: 1, _device_id: "a" },
      { id: "a", _lamport: 1, _device_id: "a" },
    ];
    const b: MergeableItem[] = [{ id: "m", _lamport: 1, _device_id: "b" }];
    expect(mergeItemSets(a, b).map((i) => i.id)).toEqual(["a", "m", "z"]);
    expect(mergeItemSets(b, a).map((i) => i.id)).toEqual(["a", "m", "z"]);
  });
});

// ---------------------------------------------------------------------------

describe("status merge — monotonic, never regresses", () => {
  const STATUSES = [
    "draft", "pending", "sent_to_kitchen", "preparing",
    "ready", "completed", "cancelled", "refunded", "void",
  ];

  it("is commutative across every pair", () => {
    for (const a of STATUSES) {
      for (const b of STATUSES) {
        expect(mergeOrderStatus(a, b)).toBe(mergeOrderStatus(b, a));
      }
    }
  });

  it("never lets a completed order fall back to draft", () => {
    // A stale device reconnecting must not re-open a settled check.
    expect(mergeOrderStatus("completed", "draft")).toBe("completed");
    expect(mergeOrderStatus("draft", "completed")).toBe("completed");
  });

  it("keeps terminal states terminal", () => {
    expect(mergeOrderStatus("void", "preparing")).toBe("void");
    expect(mergeOrderStatus("refunded", "completed")).toBe("refunded");
  });

  it("handles nulls without inventing a status", () => {
    expect(mergeOrderStatus(null, "ready")).toBe("ready");
    expect(mergeOrderStatus(null, null)).toBeNull();
  });
});

describe("session status merge", () => {
  it("never syncs a local-only status over a real one", () => {
    // seating/ordering/paying/closing describe one operator's SCREEN, not the
    // world. They must never overwrite a shared fact.
    expect(mergeSessionStatus("seating", "seated")).toBe("seated");
    expect(mergeSessionStatus("seated", "seating")).toBe("seated");
    expect(mergeSessionStatus("paying", "paid")).toBe("paid");
  });

  it("is commutative", () => {
    const all = ["available", "seating", "seated", "ordering", "ordered", "paid", "cleaning"];
    for (const a of all) {
      for (const b of all) {
        expect(mergeSessionStatus(a, b)).toBe(mergeSessionStatus(b, a));
      }
    }
  });

  it("advances monotonically", () => {
    expect(mergeSessionStatus("paid", "seated")).toBe("paid");
  });
});

// ---------------------------------------------------------------------------

describe("order header merge", () => {
  it("keeps BOTH independent field edits", () => {
    // The case whole-row LWW silently loses: a name edit on one device and a
    // table move on another.
    const a = {
      customer_name: "Alice",
      table_number: null,
      _lamport: 5,
      _device_id: "a",
    };
    const b = {
      customer_name: null,
      table_number: "T12",
      _lamport: 4,
      _device_id: "b",
    };
    const merged = mergeOrderHeader(a as never, b as never) as Record<string, unknown>;
    expect(merged.customer_name).toBe("Alice");
    expect(merged.table_number).toBe("T12");
  });

  it("is commutative", () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = makeRng(seed + 12_345);
      const mk = () => ({
        customer_name: rng() < 0.5 ? "N" + Math.floor(rng() * 3) : null,
        table_number: rng() < 0.5 ? "T" + Math.floor(rng() * 3) : null,
        status: rng() < 0.5 ? "draft" : "completed",
        _lamport: Math.floor(rng() * 5),
        _device_id: DEVICES[Math.floor(rng() * DEVICES.length)],
      });
      const a = mk();
      const b = mk();
      expect({ seed, r: canon(mergeOrderHeader(a as never, b as never)) }).toEqual({
        seed,
        r: canon(mergeOrderHeader(b as never, a as never)),
      });
    }
  });
});

// ---------------------------------------------------------------------------

describe("session merge", () => {
  it("is close-wins", () => {
    const open = { id: "s1", status: "seated", _lamport: 99, _device_id: "a" };
    const closed = {
      id: "s1",
      status: "paid",
      closed_at: "2026-01-01T00:00:00.000Z",
      _lamport: 1,
      _device_id: "b",
    };
    expect(mergeSession(open, closed).closed_at).toBeTruthy();
    expect(mergeSession(closed, open).closed_at).toBeTruthy();
  });

  it("never unlinks an order", () => {
    // A session that forgot its order is a check nobody can find.
    const withOrder = { id: "s1", order_id: "o1", _lamport: 1, _device_id: "a" };
    const without = { id: "s1", order_id: null, _lamport: 9, _device_id: "b" };
    expect(mergeSession(without, withOrder).order_id).toBe("o1");
    expect(mergeSession(withOrder, without).order_id).toBe("o1");
  });

  it("is commutative", () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = makeRng(seed + 777);
      const mk = () => ({
        id: "s1",
        status: rng() < 0.5 ? "seated" : "paid",
        order_id: rng() < 0.5 ? "o1" : null,
        closed_at: rng() < 0.3 ? "2026-01-01T00:00:00.000Z" : null,
        _lamport: Math.floor(rng() * 5),
        _device_id: DEVICES[Math.floor(rng() * DEVICES.length)],
      });
      const a = mk();
      const b = mk();
      expect({ seed, r: canon(mergeSession(a, b)) }).toEqual({
        seed,
        r: canon(mergeSession(b, a)),
      });
    }
  });
});

describe("merged table set", () => {
  it("is an add-wins commutative union", () => {
    expect(mergeTableSets(["t1", "t2"], ["t2", "t3"])).toEqual(["t1", "t2", "t3"]);
    expect(mergeTableSets(["t2", "t3"], ["t1", "t2"])).toEqual(["t1", "t2", "t3"]);
  });
});
