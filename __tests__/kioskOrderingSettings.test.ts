import { formatTableLabel } from "@/lib/formatTableLabel";
import {
  resolveOrderTypeFlow,
  shouldAskForSeat,
} from "@/lib/kiosk/orderTypeFlow";
import { sanitizeForPrint } from "@/services/printing/utils/sanitizeText";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import {
  DEFAULT_KIOSK_ORDERING,
  kioskOrdering,
  normalizeKioskOrderingSettings,
  type KioskOrderingSettings,
} from "@/types/kiosk";

const settings = (
  patch: Partial<KioskOrderingSettings>,
): KioskOrderingSettings => ({ ...DEFAULT_KIOSK_ORDERING, ...patch });

describe("normalizeKioskOrderingSettings", () => {
  it("falls back to today's behaviour for missing or malformed input", () => {
    expect(normalizeKioskOrderingSettings(undefined)).toEqual(
      DEFAULT_KIOSK_ORDERING,
    );
    expect(normalizeKioskOrderingSettings([])).toEqual(DEFAULT_KIOSK_ORDERING);
    expect(
      normalizeKioskOrderingSettings({
        order_types: "delivery",
        seat_selection_enabled: "yes",
        seat_options: "Table 1",
      }),
    ).toEqual(DEFAULT_KIOSK_ORDERING);
  });

  it("reads a web-written payload and cleans the seat list", () => {
    expect(
      normalizeKioskOrderingSettings({
        order_types: "dine_in_only",
        dine_in_only_skip_prompt: false,
        seat_selection_enabled: true,
        seat_options: [
          { id: "a", label: " Table 6 — Seat 2 " },
          { id: "b", label: "" },
          { id: "c", label: "table 6 — seat 2" },
          { label: "Patio Table 4" },
          "Bar Seat 6",
        ],
      }),
    ).toEqual({
      orderTypes: "dine_in_only",
      dineInOnlySkipPrompt: false,
      seatSelectionEnabled: true,
      seatOptions: [
        { id: "a", label: "Table 6 — Seat 2" },
        { id: "Patio Table 4", label: "Patio Table 4" },
      ],
    });
  });

  it("defaults configs persisted before ordering existed", () => {
    expect(kioskOrdering(null)).toBe(DEFAULT_KIOSK_ORDERING);
  });
});

describe("resolveOrderTypeFlow", () => {
  it("asks with both types by default", () => {
    expect(resolveOrderTypeFlow(settings({}))).toEqual({
      autoType: null,
      options: ["dine_in", "takeout"],
    });
  });

  it("skips straight to the menu for Takeaway only", () => {
    expect(
      resolveOrderTypeFlow(settings({ orderTypes: "takeout_only" })).autoType,
    ).toBe("takeout");
  });

  it("Dine-In only either auto-starts or shows a single button", () => {
    expect(
      resolveOrderTypeFlow(
        settings({ orderTypes: "dine_in_only", dineInOnlySkipPrompt: true }),
      ),
    ).toEqual({ autoType: "dine_in", options: ["dine_in"] });
    expect(
      resolveOrderTypeFlow(
        settings({ orderTypes: "dine_in_only", dineInOnlySkipPrompt: false }),
      ),
    ).toEqual({ autoType: null, options: ["dine_in"] });
  });
});

describe("shouldAskForSeat", () => {
  const on = settings({
    seatSelectionEnabled: true,
    seatOptions: [{ id: "1", label: "Table 1" }],
  });

  it("asks only for dine-in with the feature on and a non-empty list", () => {
    expect(shouldAskForSeat(on, "dine_in")).toBe(true);
    expect(shouldAskForSeat(on, "takeout")).toBe(false);
    expect(shouldAskForSeat(on, null)).toBe(false);
    expect(
      shouldAskForSeat({ ...on, seatSelectionEnabled: false }, "dine_in"),
    ).toBe(false);
    expect(shouldAskForSeat({ ...on, seatOptions: [] }, "dine_in")).toBe(false);
  });
});

describe("formatTableLabel", () => {
  it("prefixes bare table names only", () => {
    expect(formatTableLabel("6")).toBe("Table 6");
    expect(formatTableLabel("T6")).toBe("Table T6");
    expect(formatTableLabel("Table 5")).toBe("Table 5");
    expect(formatTableLabel("Table 6 — Seat 2")).toBe("Table 6 — Seat 2");
    expect(formatTableLabel("Patio Table 4", "TABLE: ")).toBe("Patio Table 4");
    expect(formatTableLabel("6", "TABLE: ")).toBe("TABLE: 6");
    expect(formatTableLabel("  ")).toBe("");
    expect(formatTableLabel(null)).toBe("");
  });
});

describe("useKioskCartStore seatLabel", () => {
  beforeEach(() => useKioskCartStore.getState().clear());

  it("keeps the seat for dine-in, drops it for takeout and on clear", () => {
    const cart = useKioskCartStore.getState();
    cart.setOrderType("dine_in");
    cart.setSeatLabel("Table 6 — Seat 2");
    expect(useKioskCartStore.getState().seatLabel).toBe("Table 6 — Seat 2");

    cart.setOrderType("dine_in");
    expect(useKioskCartStore.getState().seatLabel).toBe("Table 6 — Seat 2");

    cart.setOrderType("takeout");
    expect(useKioskCartStore.getState().seatLabel).toBeNull();

    cart.setOrderType("dine_in");
    cart.setSeatLabel("Bar Seat 6");
    cart.clear();
    expect(useKioskCartStore.getState().seatLabel).toBeNull();
  });
});

describe("seat labels on raw ESC/POS prints", () => {
  it("sanitizes the em-dash instead of printing '?'", () => {
    expect(sanitizeForPrint(formatTableLabel("Table 6 — Seat 2", "TABLE: "))).toBe(
      "Table 6 - Seat 2",
    );
  });
});
