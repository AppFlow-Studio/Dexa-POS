import {
  composeKioskLocationLabel,
  formatTableLabel,
} from "@/lib/formatTableLabel";
import {
  resolveKioskLocationLabel,
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
      tableLabel: null,
      seatMode: "ask",
      fixedSeatLabel: null,
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

  it("reads a fixed table + fixed seat and derives the legacy flag", () => {
    const s = normalizeKioskOrderingSettings({
      table_label: "  Table   1 ",
      seat_mode: "fixed",
      fixed_seat_label: " 3 ",
      seat_selection_enabled: true,
    });
    expect(s.tableLabel).toBe("Table 1");
    expect(s.seatMode).toBe("fixed");
    expect(s.fixedSeatLabel).toBe("3");
    expect(s.seatSelectionEnabled).toBe(false);
  });

  it("maps rows without seat_mode from the legacy boolean", () => {
    expect(
      normalizeKioskOrderingSettings({ seat_selection_enabled: true }).seatMode,
    ).toBe("ask");
    expect(normalizeKioskOrderingSettings({}).seatMode).toBe("off");
  });

  it("degrades a fixed seat with no label to off", () => {
    const s = normalizeKioskOrderingSettings({
      seat_mode: "fixed",
      fixed_seat_label: "  ",
    });
    expect(s.seatMode).toBe("off");
    expect(s.fixedSeatLabel).toBeNull();
  });

  it("fills seat mode for MMKV configs persisted before it existed", () => {
    const legacy = {
      orderTypes: "both",
      dineInOnlySkipPrompt: true,
      seatSelectionEnabled: true,
      seatOptions: [{ id: "a", label: "Bar 1" }],
    } as unknown as KioskOrderingSettings;
    const s = kioskOrdering({ ordering: legacy } as never);
    expect(s.seatMode).toBe("ask");
    expect(s.tableLabel).toBeNull();
    expect(s.fixedSeatLabel).toBeNull();
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
    seatMode: "ask",
    seatSelectionEnabled: true,
    seatOptions: [{ id: "1", label: "Table 1" }],
  });

  it("asks only for dine-in with the feature on and a non-empty list", () => {
    expect(shouldAskForSeat(on, "dine_in")).toBe(true);
    expect(shouldAskForSeat(on, "takeout")).toBe(false);
    expect(shouldAskForSeat(on, null)).toBe(false);
    expect(shouldAskForSeat({ ...on, seatMode: "off" }, "dine_in")).toBe(false);
    expect(shouldAskForSeat({ ...on, seatOptions: [] }, "dine_in")).toBe(false);
  });

  it("never asks when the kiosk has a fixed seat", () => {
    expect(
      shouldAskForSeat({ ...on, seatMode: "fixed", fixedSeatLabel: "3" }, "dine_in"),
    ).toBe(false);
  });
});

describe("composeKioskLocationLabel", () => {
  it("prefixes numbers and keeps named labels", () => {
    expect(composeKioskLocationLabel("1", "3")).toBe("Table 1, Seat 3");
    expect(composeKioskLocationLabel("Counter", "Stool 3")).toBe("Counter, Stool 3");
    expect(composeKioskLocationLabel("Table 1", null)).toBe("Table 1");
    expect(composeKioskLocationLabel(null, "3")).toBe("Seat 3");
    expect(composeKioskLocationLabel(" ", null)).toBe("");
  });
});

describe("resolveKioskLocationLabel", () => {
  const cases: [Partial<KioskOrderingSettings>, string | null, string | null][] = [
    // [settings, picked seat, expected]
    [{ tableLabel: "1", seatMode: "fixed", fixedSeatLabel: "3" }, null, "Table 1, Seat 3"],
    [{ tableLabel: "1", seatMode: "ask" }, "5", "Table 1, Seat 5"],
    [{ tableLabel: "1", seatMode: "off" }, "5", "Table 1"],
    [{ seatMode: "fixed", fixedSeatLabel: "3" }, null, "Seat 3"],
    [{ seatMode: "ask" }, "Patio Table 4", "Patio Table 4"],
    [{ seatMode: "ask" }, "12", "12"], // legacy list: raw, staff surfaces format it
    [{ seatMode: "ask" }, null, null],
    [{ seatMode: "off" }, null, null],
  ];

  it.each(cases)("dine-in %j + %p → %p", (patch, picked, expected) => {
    expect(resolveKioskLocationLabel(settings(patch), "dine_in", picked)).toBe(
      expected,
    );
  });

  it("is null for takeout even with a fixed table and seat", () => {
    expect(
      resolveKioskLocationLabel(
        settings({ tableLabel: "1", seatMode: "fixed", fixedSeatLabel: "3" }),
        "takeout",
        null,
      ),
    ).toBeNull();
  });

  it("stays readable on raw ESC/POS prints", () => {
    const label = resolveKioskLocationLabel(
      settings({ tableLabel: "1", seatMode: "fixed", fixedSeatLabel: "3" }),
      "dine_in",
      null,
    );
    expect(sanitizeForPrint(formatTableLabel(label, "TABLE: "))).toBe(
      "Table 1, Seat 3",
    );
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
