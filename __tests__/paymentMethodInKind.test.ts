import {
  DB_INKIND_METHOD,
  fromDbPaymentMethod,
  isInKindMethod,
  isMonetaryMethod,
  paymentTypeLabel,
  toDbPaymentMethod,
  usesCardPricing,
} from "@/lib/paymentMethod";

/**
 * In-kind is a NON-TENDER settlement: the check closes at CARD pricing with
 * no money collected. These tests pin the two properties the rest of the
 * feature leans on:
 *   1. 'inkind' survives the DB↔UI round trip instead of being flattened
 *      into Card (or Cash) by the historical inline normalizers.
 *   2. It is card-PRICED but not a monetary tender — the distinction the
 *      drawer/settlement/deposit math depends on.
 */
describe("paymentMethod — in-kind conversion", () => {
  describe("fromDbPaymentMethod", () => {
    it("maps 'inkind' to InKind rather than the legacy Card fallback", () => {
      expect(fromDbPaymentMethod("inkind")).toBe("InKind");
    });

    it("is case/whitespace tolerant (values arrive from several code paths)", () => {
      expect(fromDbPaymentMethod("InKind")).toBe("InKind");
      expect(fromDbPaymentMethod("  inkind  ")).toBe("InKind");
    });

    it("still maps cash and every card variant as before", () => {
      expect(fromDbPaymentMethod("cash")).toBe("Cash");
      for (const m of [
        "card",
        "card_spinapi",
        "card_dvpaylite",
        "card_manual",
        "card_online",
      ]) {
        expect(fromDbPaymentMethod(m)).toBe("Card");
      }
    });

    it("preserves the historical Card fallback for unknown/missing values", () => {
      // Deliberate: changing this would silently re-bucket existing
      // gift_card / house_account / external rows.
      expect(fromDbPaymentMethod("gift_card")).toBe("Card");
      expect(fromDbPaymentMethod(null)).toBe("Card");
      expect(fromDbPaymentMethod(undefined)).toBe("Card");
      expect(fromDbPaymentMethod("")).toBe("Card");
    });
  });

  describe("toDbPaymentMethod", () => {
    it("sends 'inkind' to the backend, never 'card'", () => {
      // The bug this guards: `isCash ? "cash" : "card"` in useOrderStore
      // would have posted an in-kind settlement as a real card sale.
      expect(toDbPaymentMethod("InKind")).toBe(DB_INKIND_METHOD);
      expect(toDbPaymentMethod("InKind")).not.toBe("card");
    });

    it("maps Cash and Card unchanged", () => {
      expect(toDbPaymentMethod("Cash")).toBe("cash");
      expect(toDbPaymentMethod("Card")).toBe("card");
    });

    it("degrades Split to 'card' loudly rather than throwing", () => {
      // Split is not a tender, and no call site produces it. This must not
      // throw: toDbPaymentMethod runs on the offline-replay path, where a
      // crash would strand a real queued payment instead of syncing it.
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(toDbPaymentMethod("Split")).toBe("card");
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("round-trips through the DB representation", () => {
      for (const t of ["Cash", "Card", "InKind"] as const) {
        expect(fromDbPaymentMethod(toDbPaymentMethod(t))).toBe(t);
      }
    });

    it("keeps the legacy 'not Cash => card' result for unknown input", () => {
      // Offline replay can hand us a method persisted by an older build.
      // The behaviour must match the inline expressions this replaced, so
      // no queued payment changes meaning on upgrade.
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(toDbPaymentMethod("Voucher" as never)).toBe("card");
        expect(toDbPaymentMethod(undefined as never)).toBe("card");
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("money-movement predicates", () => {
    it("treats in-kind as non-monetary and everything else as monetary", () => {
      expect(isInKindMethod("inkind")).toBe(true);
      expect(isMonetaryMethod("inkind")).toBe(false);

      for (const m of ["cash", "card", "card_spinapi", "gift_card"]) {
        expect(isInKindMethod(m)).toBe(false);
        expect(isMonetaryMethod(m)).toBe(true);
      }
    });

    it("does not classify null/undefined as in-kind", () => {
      // Guards the endOfDay / batch filters: a missing method must not
      // accidentally drop out of the monetary buckets.
      expect(isInKindMethod(null)).toBe(false);
      expect(isInKindMethod(undefined)).toBe(false);
      expect(isMonetaryMethod(null)).toBe(true);
    });
  });

  describe("pricing", () => {
    it("prices in-kind at CARD rates, like Card and unlike Cash", () => {
      // This is the whole point of in-kind: revenue posts at menu price,
      // with no cash-discount applied.
      expect(usesCardPricing("InKind")).toBe(true);
      expect(usesCardPricing("Card")).toBe(true);
      expect(usesCardPricing("Cash")).toBe(false);
    });
  });

  describe("labels", () => {
    it("renders the InKind type as the spec label 'inKind'", () => {
      expect(paymentTypeLabel("InKind")).toBe("inKind");
      expect(paymentTypeLabel("Card")).toBe("Card");
      expect(paymentTypeLabel("Cash")).toBe("Cash");
    });
  });
});
