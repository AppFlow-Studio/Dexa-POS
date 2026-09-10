/// <reference types="jest" />
/**
 * Order calculator measurement harness — §4.0 of
 * docs/engineering/architecture/local-first-orders-seating.md.
 *
 * The plan makes this step mandatory before any optimization lands, because
 * the whole of Phase 1 rests on a claim that has never been measured: that
 * `calculateOrderTotals` is slow enough on the add-item path to be worth
 * rewriting. If it turns out to be 2ms of a 180ms tap→paint, Phase 1 is the
 * wrong fix and §4.3 (the re-render fan-out) or the `add_order_item_v4` round
 * trip is the right one.
 *
 * WHAT THIS DOES AND DOES NOT TELL YOU
 * ------------------------------------
 * This runs in Node on a dev machine, NOT on a tablet. Absolute milliseconds
 * here are optimistic by a large and unknown factor — Hermes on an ARM tablet
 * is a different machine. What it DOES establish, and what the plan actually
 * needs, is:
 *
 *   1. The RATIO of hash overhead to real math. That ratio is a property of
 *      the code, not the hardware, so it transfers.
 *   2. The SCALING in item count. Also a property of the code.
 *   3. Whether the cache can hit at all on the add-item path.
 *
 * The tap→paint half of §4.0 still needs a device and
 * `startInteraction("pos.add_to_cart")` (useOrderStore.ts:8455).
 *
 * This asserts structure, never wall-clock time — a timing assertion would be
 * flaky in CI and is not what the file is for. It prints a table; read it.
 */

import {
  calculateOrderTotals,
  hashCalculationInput,
  invalidateCalculationCache,
} from "@/lib/order-calculator";
import { CartItem, Discount } from "@/lib/types";
import { TaxRatesMap } from "@/types/menu";

// ---------------------------------------------------------------------------
// Fixtures — deliberately varied. A benchmark over 50 identical items measures
// the wrong thing: real carts mix tax categories, quantities and modifiers,
// and the discount-distribution pass is O(n) over DISTINCT proportions.
// ---------------------------------------------------------------------------

const TAX_RATES: TaxRatesMap = {
  standard: 8.875,
  alcohol: 12.0,
  exempt: 0,
};

const TAX_CATEGORIES = ["standard", "alcohol", "exempt"] as const;

function makeItem(index: number): CartItem {
  // Prices that do not divide evenly, so the proportional discount
  // distribution actually has remainders to push around.
  const base = 3.25 + (index % 17) * 1.13;
  return {
    id: `item_${index}`,
    menuItemId: `menu_${index % 40}`,
    name: `Item ${index}`,
    quantity: 1 + (index % 3),
    paidQuantity: 0,
    originalPrice: base,
    price: base,
    unitPrice: base,
    cashPrice: base * 0.96,
    baseCardPrice: base,
    baseCashPrice: base * 0.96,
    image: undefined,
    customizations: {},
    subtotal: base,
    cashSubtotal: base * 0.96,
    taxRate: 8.875,
    taxAmount: 0,
    cashTaxAmount: 0,
    tax_category: TAX_CATEGORIES[index % TAX_CATEGORIES.length],
  } as CartItem;
}

function makeOrder(itemCount: number): CartItem[] {
  return Array.from({ length: itemCount }, (_, i) => makeItem(i));
}

/**
 * Distinct inputs so the cache is forced to miss — the add-item path.
 *
 * The perturbation is on `price`, not `quantity`. The first version of this
 * moved a quantity to `1 + (run % 9)` on item `run % len`, which for the first
 * few runs collided exactly with the value `makeItem` had already assigned
 * (`1 + (index % 3)`) — so "distinct" inputs hashed identically and the
 * cache-miss benchmark was silently measuring cache HITS. The distinctness
 * assertion below is what caught it, which is the reason it exists.
 */
function makeDistinctInputs(
  itemCount: number,
  count: number,
  extras: { discount?: Discount | null; payments?: { amount: number }[] } = {},
) {
  return Array.from({ length: count }, (_, run) => {
    const items = makeOrder(itemCount);
    const target = run % items.length;
    items[target] = {
      ...items[target],
      price: items[target].price + (run + 1) * 0.01,
      unitPrice: items[target].unitPrice + (run + 1) * 0.01,
      baseCardPrice: (items[target].baseCardPrice ?? 0) + (run + 1) * 0.01,
    };
    return {
      items,
      checkDiscount: extras.discount ?? null,
      taxRatesMap: TAX_RATES,
      payments: extras.payments ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function timeIt(label: string, iterations: number, fn: (i: number) => void) {
  // Warm up so we measure steady-state, not JIT tier-up.
  for (let i = 0; i < Math.min(200, iterations); i++) fn(i);

  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn(i);
  const elapsedNs = Number(process.hrtime.bigint() - started);

  return {
    label,
    iterations,
    totalMs: elapsedNs / 1e6,
    perCallUs: elapsedNs / iterations / 1e3,
  };
}

const ITEM_COUNTS = [1, 10, 25, 50];
const ITERATIONS = 2000;

interface Row {
  items: number;
  coldUs: number;
  warmUs: number;
  hashUs: number;
  hashShare: string;
}

describe("§4.0 — order calculator measurement harness", () => {
  const rows: Row[] = [];

  it("measures cold (cache-miss) vs warm (cache-hit) vs hash-only cost", () => {
    for (const itemCount of ITEM_COUNTS) {
      const inputs = makeDistinctInputs(itemCount, 64);

      // COLD: the add-item path. Every call has a changed input, so the
      // 2s-TTL cache is structurally incapable of hitting. Cleared each
      // iteration so a lucky repeat inside the 64-input cycle cannot help.
      const cold = timeIt(`cold n=${itemCount}`, ITERATIONS, (i) => {
        invalidateCalculationCache();
        calculateOrderTotals(inputs[i % inputs.length]);
      });

      // WARM: the re-render path. Identical input every call — the best case
      // the current cache can possibly deliver.
      invalidateCalculationCache();
      const warmInput = inputs[0];
      calculateOrderTotals(warmInput); // seed
      const warm = timeIt(`warm n=${itemCount}`, ITERATIONS, () => {
        calculateOrderTotals(warmInput);
      });

      // HASH ONLY: what every call pays before any arithmetic happens.
      const hash = timeIt(`hash n=${itemCount}`, ITERATIONS, (i) => {
        hashCalculationInput(inputs[i % inputs.length]);
      });

      rows.push({
        items: itemCount,
        coldUs: cold.perCallUs,
        warmUs: warm.perCallUs,
        hashUs: hash.perCallUs,
        hashShare: `${((hash.perCallUs / cold.perCallUs) * 100).toFixed(1)}%`,
      });
    }

    // The harness is only useful if it actually ran every size.
    expect(rows).toHaveLength(ITEM_COUNTS.length);

    /* eslint-disable no-console */
    console.log(
      "\n=== §4.0 calculateOrderTotals — Node/dev-machine baseline ===\n" +
        "(ratios and scaling transfer to device; absolute µs do not)\n",
    );
    console.table(
      rows.map((r) => ({
        items: r.items,
        "cold µs/call": r.coldUs.toFixed(1),
        "warm µs/call": r.warmUs.toFixed(1),
        "hash µs/call": r.hashUs.toFixed(1),
        "hash % of cold": r.hashShare,
      })),
    );
    /* eslint-enable no-console */
  });

  it("measures the expensive path: discount distribution + payment coverage", () => {
    // A plain cart skips two whole passes. A real dine-in check late in its
    // life has a check discount (→ proportional distribution over every item)
    // and partial payments (→ per-item coverage allocation). Benchmarking only
    // the plain path would understate the worst case, which is the one the
    // operator is standing in front of.
    const discount = {
      id: "disc_1",
      name: "10% off",
      label: "10% off",
      type: "percentage",
      value: 0.1,
    } as unknown as Discount;

    const heavyRows: { items: number; plainUs: number; heavyUs: number }[] = [];

    for (const itemCount of ITEM_COUNTS) {
      const plain = makeDistinctInputs(itemCount, 64);
      const heavy = makeDistinctInputs(itemCount, 64, {
        discount,
        payments: [{ amount: 5 }, { amount: 7.5 }],
      });

      const plainT = timeIt(`plain n=${itemCount}`, ITERATIONS, (i) => {
        invalidateCalculationCache();
        calculateOrderTotals(plain[i % plain.length]);
      });
      const heavyT = timeIt(`heavy n=${itemCount}`, ITERATIONS, (i) => {
        invalidateCalculationCache();
        calculateOrderTotals(heavy[i % heavy.length]);
      });

      heavyRows.push({
        items: itemCount,
        plainUs: plainT.perCallUs,
        heavyUs: heavyT.perCallUs,
      });
    }

    expect(heavyRows).toHaveLength(ITEM_COUNTS.length);

    /* eslint-disable no-console */
    console.log("\n=== §4.0 plain cart vs discounted + partially-paid ===\n");
    console.table(
      heavyRows.map((r) => ({
        items: r.items,
        "plain µs/call": r.plainUs.toFixed(1),
        "discount+payments µs/call": r.heavyUs.toFixed(1),
        "×": (r.heavyUs / r.plainUs).toFixed(2),
      })),
    );
    /* eslint-enable no-console */
  });

  it("spike: what integer minor-units math would actually buy (§4.2 gate)", () => {
    // §4.2 proposes replacing decimal.js with integer minor-units arithmetic.
    // That is the largest and riskiest piece of Phase 1 — it touches money —
    // so it needs a number BEFORE it is built, not a plausible story.
    //
    // This is not a real calculator. It is the same arithmetic SHAPE both
    // ways (per-item extension, per-item tax, accumulate) so the ratio
    // isolates the cost of the numeric representation and nothing else.
    const Decimal = require("decimal.js");
    const items = makeOrder(50);

    const decimalPass = timeIt("decimal", ITERATIONS, () => {
      let sub = new Decimal(0);
      let tax = new Decimal(0);
      for (const it of items) {
        const line = new Decimal(it.price).times(it.quantity);
        const rate = TAX_RATES[(it as any).tax_category ?? "standard"] ?? 0;
        const lineTax = line
          .times(rate)
          .dividedBy(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        sub = sub.plus(line);
        tax = tax.plus(lineTax);
      }
      return sub.plus(tax).toNumber();
    });

    const integerPass = timeIt("integer", ITERATIONS, () => {
      let subMinor = 0;
      let taxMinor = 0;
      for (const it of items) {
        const lineMinor = Math.round(it.price * 100) * it.quantity;
        const rate = TAX_RATES[(it as any).tax_category ?? "standard"] ?? 0;
        const lineTaxMinor = Math.round((lineMinor * rate) / 100);
        subMinor += lineMinor;
        taxMinor += lineTaxMinor;
      }
      return (subMinor + taxMinor) / 100;
    });

    const speedup = decimalPass.perCallUs / integerPass.perCallUs;
    expect(speedup).toBeGreaterThan(1);

    /* eslint-disable no-console */
    console.log(
      `\n=== §4.2 gate — numeric representation, 50 items, same shape ===\n` +
        `  decimal.js : ${decimalPass.perCallUs.toFixed(1)} µs/call\n` +
        `  integer    : ${integerPass.perCallUs.toFixed(1)} µs/call\n` +
        `  speedup    : ${speedup.toFixed(1)}×\n`,
    );
    /* eslint-enable no-console */
  });

  it("confirms the cache cannot hit on the add-item path", () => {
    // The claim in §1.3a, asserted rather than assumed: two calls whose item
    // set differs produce different cache keys, so the second is a miss.
    // If this ever fails, the cache key has stopped tracking the input and
    // the cache has become a CORRECTNESS bug, not a performance one.
    const [a, b] = makeDistinctInputs(10, 2);
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));

    // ...and an unchanged input does hit, which is the re-render case §4.1
    // says to preserve with an O(1) revision key instead.
    expect(hashCalculationInput(a)).toBe(hashCalculationInput(a));
  });

  it("records how much work the hash does per call", () => {
    // The hash stringifies a projection of EVERY item before any math starts.
    // Its length is the clearest evidence of that: it grows linearly with the
    // cart, on a path that is a guaranteed cache miss.
    const small = hashCalculationInput(makeDistinctInputs(1, 1)[0]).length;
    const large = hashCalculationInput(makeDistinctInputs(50, 1)[0]).length;

    // Linear in item count, on a path that is a guaranteed miss. The absolute
    // ratio is below 50× because a fixed ~250-char service-charge envelope is
    // in every key regardless of cart size.
    expect(large).toBeGreaterThan(small * 5);

    /* eslint-disable no-console */
    console.log(
      `\n§1.3a evidence — cache-key string length: ` +
        `1 item = ${small} chars, 50 items = ${large} chars ` +
        `(${(large / small).toFixed(1)}× growth, stringified per call, always a miss on add)\n`,
    );
    /* eslint-enable no-console */
  });
});
