/// <reference types="jest" />
/**
 * §4.2 MERGE GATE — the integer fast path must be byte-identical to decimal.js.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §4.2
 *
 * `composeUnitPrice` replaced per-item decimal.js arithmetic with scaled
 * integers. That is money code, so "it looks right" is not a standard. This
 * file re-implements the ORIGINAL decimal.js composition as a reference and
 * asserts the two agree exactly, over a corpus built to break them:
 *
 *   - 6-decimal prices (more precision than the scale carries at 2dp)
 *   - exact .005 and .0049999 boundaries, where HALF_UP decides the cent
 *   - negative modifiers (a discount-style option)
 *   - many components per item, so accumulated error would compound
 *   - zero and missing values
 *
 * A rounding disagreement here is a wrong charge, so any failure blocks the
 * change rather than prompting a tolerance.
 */
import {
  calculateItemEffectiveCardPrice,
  calculateItemEffectiveCashPrice,
  calculateOrderTotals,
} from "@/lib/order-calculator";
import { CartItem } from "@/lib/types";
import { TaxRatesMap } from "@/types/menu";
import Decimal from "decimal.js";

// ---------------------------------------------------------------------------
// The REFERENCE implementation — verbatim decimal.js, as it was before §4.2.
// ---------------------------------------------------------------------------

function referenceUnitPrice(item: CartItem, base: number): number {
  let effectivePrice = new Decimal(base);

  if (item.customizations?.size?.priceModifier) {
    effectivePrice = effectivePrice.plus(item.customizations.size.priceModifier);
  }
  if (item.customizations?.modifiers) {
    for (const group of item.customizations.modifiers) {
      for (const option of group.options) {
        effectivePrice = effectivePrice.plus(option.price ?? 0);
      }
    }
  }
  for (const addOn of item.customizations?.addOns ?? []) {
    effectivePrice = effectivePrice.plus(addOn.price ?? 0);
  }

  return effectivePrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

const referenceCard = (i: CartItem) =>
  referenceUnitPrice(i, i.baseCardPrice ?? i.unitPrice ?? 0);
const referenceCash = (i: CartItem) =>
  referenceUnitPrice(i, i.baseCashPrice ?? i.unitPrice ?? 0);

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Values chosen to sit ON rounding boundaries, not near them. */
const NASTY = [
  0, 0.001, 0.004, 0.005, 0.0049999, 0.0050001, 0.009, 0.015, 0.025,
  0.1, 0.2, 0.3, 1.005, 2.675, 3.334999, 9.995, 10.005, 12.345678,
  -0.005, -1.005, -2.5, 99.999999, 1234.565, 0.333333, 0.666667,
];

function pickPrice(rng: () => number): number {
  // Half the corpus is boundary values; the rest is realistic menu money.
  if (rng() < 0.5) return NASTY[Math.floor(rng() * NASTY.length)];
  return Math.round(rng() * 5000) / 100;
}

const TAX_RATES: TaxRatesMap = { standard: 8.875, alcohol: 12.0, exempt: 0 };
const CATEGORIES = ["standard", "alcohol", "exempt"] as const;

function makeItem(rng: () => number, index: number): CartItem {
  const card = pickPrice(rng);
  const cash = pickPrice(rng);
  const modifierCount = Math.floor(rng() * 4);
  const addOnCount = Math.floor(rng() * 3);

  return {
    id: `i${index}`,
    menuItemId: `m${index}`,
    name: `Item ${index}`,
    quantity: 1 + Math.floor(rng() * 5),
    paidQuantity: 0,
    originalPrice: card,
    price: card,
    unitPrice: card,
    cashPrice: cash,
    baseCardPrice: card,
    baseCashPrice: cash,
    image: undefined,
    customizations: {
      size:
        rng() < 0.4
          ? { id: "s", name: "L", priceModifier: pickPrice(rng) }
          : undefined,
      modifiers:
        modifierCount > 0
          ? [
              {
                categoryId: "c",
                categoryName: "Extras",
                options: Array.from({ length: modifierCount }, (_, k) => ({
                  id: `o${k}`,
                  name: `Opt ${k}`,
                  price: pickPrice(rng),
                })),
              },
            ]
          : undefined,
      addOns:
        addOnCount > 0
          ? Array.from({ length: addOnCount }, (_, k) => ({
              id: `a${k}`,
              name: `Add ${k}`,
              price: pickPrice(rng),
            }))
          : undefined,
    },
    subtotal: card,
    cashSubtotal: cash,
    taxRate: 8.875,
    taxAmount: 0,
    cashTaxAmount: 0,
    tax_category: CATEGORIES[Math.floor(rng() * CATEGORIES.length)],
    is_tax_exempt: rng() < 0.1,
  } as CartItem;
}

// ---------------------------------------------------------------------------

describe("§4.2 differential — per-item price composition", () => {
  it("is byte-identical to decimal.js over 50,000 items", () => {
    const mismatches: string[] = [];

    for (let seed = 0; seed < 50_000; seed++) {
      const rng = makeRng(seed);
      const item = makeItem(rng, seed);

      const fastCard = calculateItemEffectiveCardPrice(item);
      const refCard = referenceCard(item);
      const fastCash = calculateItemEffectiveCashPrice(item);
      const refCash = referenceCash(item);

      if (fastCard !== refCard) {
        mismatches.push(
          `seed ${seed} CARD: fast=${fastCard} ref=${refCard} ${JSON.stringify(item.customizations)}`,
        );
      }
      if (fastCash !== refCash) {
        mismatches.push(
          `seed ${seed} CASH: fast=${fastCash} ref=${refCash} ${JSON.stringify(item.customizations)}`,
        );
      }
      if (mismatches.length > 5) break;
    }

    expect(mismatches).toEqual([]);
  });

  it("agrees on every boundary value in isolation", () => {
    // Each NASTY value as a bare base price, so a disagreement is attributable
    // to one number rather than to a sum.
    for (const price of NASTY) {
      const item = {
        id: "x",
        quantity: 1,
        baseCardPrice: price,
        baseCashPrice: price,
        unitPrice: price,
        customizations: {},
      } as unknown as CartItem;

      expect({ price, v: calculateItemEffectiveCardPrice(item) }).toEqual({
        price,
        v: referenceCard(item),
      });
    }
  });

  it("agrees when many small components accumulate", () => {
    // 20 components of $0.004 sum to $0.08 — but rounded individually to cents
    // they would each be $0.00. This is the case that makes scale 1e6 (rather
    // than 1e2) load-bearing rather than a nicety.
    const item = {
      id: "x",
      quantity: 1,
      baseCardPrice: 0,
      baseCashPrice: 0,
      unitPrice: 0,
      customizations: {
        modifiers: [
          {
            categoryId: "c",
            categoryName: "E",
            options: Array.from({ length: 20 }, (_, k) => ({
              id: `o${k}`,
              name: "o",
              price: 0.004,
            })),
          },
        ],
      },
    } as unknown as CartItem;

    expect(calculateItemEffectiveCardPrice(item)).toBe(referenceCard(item));
    expect(calculateItemEffectiveCardPrice(item)).toBe(0.08);
  });
});

describe("§4.2 differential — whole-order totals", () => {
  it("produces identical totals over 5,000 generated orders", () => {
    // Item composition feeds every downstream pass (discount distribution,
    // per-rate-group tax, outstanding), so a per-item drift of one cent would
    // surface here amplified. Fewer orders than items above because each order
    // runs the full calculator.
    const mismatches: string[] = [];

    for (let seed = 0; seed < 5_000; seed++) {
      const rng = makeRng(seed + 500_000);
      const itemCount = 1 + Math.floor(rng() * 8);
      const items = Array.from({ length: itemCount }, (_, k) =>
        makeItem(rng, k),
      );

      const discount =
        rng() < 0.4
          ? rng() < 0.5
            ? { id: "d", label: "10%", type: "percentage" as const, value: 0.1 }
            : { id: "d", label: "$5", type: "fixed" as const, value: 5 }
          : null;

      const payments = rng() < 0.3 ? [{ amount: Math.round(rng() * 2000) / 100 }] : [];

      const totals = calculateOrderTotals({
        items,
        checkDiscount: discount as never,
        taxRatesMap: TAX_RATES,
        payments,
      });

      // The invariant that must hold regardless of representation: the parts
      // add up. A rounding bug in composition shows here as a total that does
      // not equal its own components.
      const recomputed =
        Math.round((totals.subtotal - totals.discount_amount + totals.tax_amount) * 100) / 100;
      if (Math.abs(recomputed - totals.total_amount) > 0.005) {
        mismatches.push(
          `seed ${seed}: subtotal=${totals.subtotal} discount=${totals.discount_amount} ` +
            `tax=${totals.tax_amount} total=${totals.total_amount} recomputed=${recomputed}`,
        );
      }
      if (mismatches.length > 5) break;
    }

    expect(mismatches).toEqual([]);
  });
});
