/**
 * Which cart lines the local-first repair saves again, and which orders
 * Previous Orders must surface from the device while online.
 */
import {
  STARTUP_REPAIR_WINDOW_MS,
  hasLinesNotOnServer,
  isUnsavedLine,
  selectUnsavedLineIds,
} from "@/lib/unsavedItems";
import type { CartItem, OrderProfile } from "@/lib/types";

const NOW = Date.parse("2026-09-30T10:00:00.000Z");

function line(id: string, overrides: Partial<CartItem> = {}): CartItem {
  return { id, ...overrides } as CartItem;
}

function order(items: CartItem[], overrides: Partial<OrderProfile> = {}) {
  return {
    items,
    order_status: "sent_to_kitchen",
    opened_at: "2026-09-30T08:57:00.000Z",
    ...overrides,
  } as OrderProfile;
}

const never = () => false;
const always = () => true;

describe("isUnsavedLine", () => {
  it("is a line with neither a local row nor a server id", () => {
    expect(isUnsavedLine(line("a"))).toBe(true);
    expect(isUnsavedLine(line("a", { item_row_id: "r" }))).toBe(false);
    expect(isUnsavedLine(line("a", { db_order_item_id: "d" }))).toBe(false);
  });

  it("ignores drafts and voided lines", () => {
    expect(isUnsavedLine(line("a", { isDraft: true }))).toBe(false);
    expect(isUnsavedLine(line("a", { is_voided: true }))).toBe(false);
  });
});

describe("selectUnsavedLineIds", () => {
  const items = [
    line("failed"),
    line("not-yet-written"),
    line("saved", { item_row_id: "r" }),
    line("in-flight"),
  ];
  const isFailed = (id: string) => id === "failed" || id === "in-flight";
  const isInFlight = (id: string) => id === "in-flight";

  it("in-session, takes only lines seen to fail and not in flight", () => {
    expect(
      selectUnsavedLineIds(order(items), {
        startup: false,
        now: NOW,
        isFailed,
        isInFlight,
      }),
    ).toEqual(["failed"]);
  });

  it("at startup, takes every unsaved line on a recent open order", () => {
    expect(
      selectUnsavedLineIds(order(items), {
        startup: true,
        now: NOW,
        isFailed: never,
        isInFlight,
      }),
    ).toEqual(["failed", "not-yet-written"]);
  });

  it("at startup, leaves orders older than the repair window alone", () => {
    const old = new Date(NOW - STARTUP_REPAIR_WINDOW_MS - 1).toISOString();
    expect(
      selectUnsavedLineIds(order(items, { opened_at: old }), {
        startup: true,
        now: NOW,
        isFailed: always,
        isInFlight: never,
      }),
    ).toEqual([]);
  });

  it("never touches a finished order", () => {
    for (const order_status of ["completed", "void", "cancelled"] as const) {
      expect(
        selectUnsavedLineIds(order(items, { order_status }), {
          startup: true,
          now: NOW,
          isFailed: always,
          isInFlight: never,
        }),
      ).toEqual([]);
    }
  });

  it("can be scoped to a kitchen batch", () => {
    expect(
      selectUnsavedLineIds(order(items), {
        startup: false,
        now: NOW,
        onlyIds: new Set(["saved", "in-flight"]),
        isFailed: always,
        isInFlight: never,
      }),
    ).toEqual(["in-flight"]);
  });
});

describe("hasLinesNotOnServer", () => {
  it("is true while any real line lacks a server id", () => {
    expect(hasLinesNotOnServer(order([line("a", { item_row_id: "r" })]))).toBe(
      true,
    );
    expect(
      hasLinesNotOnServer(order([line("a", { db_order_item_id: "d" })])),
    ).toBe(false);
    expect(hasLinesNotOnServer(order([line("a", { isDraft: true })]))).toBe(
      false,
    );
    expect(hasLinesNotOnServer(order([]))).toBe(false);
  });
});
