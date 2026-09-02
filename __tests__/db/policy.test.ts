/**
 * Phase 1 acceptance — station scoping.
 *
 * The plan's "watch for" on Phase 1 is that a policy failure here puts customer
 * PII on a dining-room kiosk. These are pure functions, so they are cheap to
 * assert exhaustively — and exhaustive is the right bar for this one.
 */
import { canStore, forbiddenTables, stationKind } from "@/lib/db/policy";
import { TABLES } from "@/lib/db/schema";

describe("stationKind", () => {
  it("maps station_type the same way lib/authFlow.ts routes it", () => {
    expect(stationKind("kds")).toBe("kds");
    expect(stationKind("self_service")).toBe("kiosk");
    expect(stationKind("pos")).toBe("pos");
    expect(stationKind("terminal")).toBe("pos");
  });

  it("defaults to pos for null/undefined, matching resolvePostLoginRoute", () => {
    expect(stationKind(null)).toBe("pos");
    expect(stationKind(undefined)).toBe("pos");
  });
});

describe("canStore — PII containment", () => {
  const PII_TABLES = ["orders", "order_items", "order_payments", "customers", "staff"] as const;

  it("lets a POS store everything", () => {
    for (const table of TABLES) {
      expect(canStore("pos", table)).toBe(true);
    }
  });

  it("never lets a kiosk store order history, customers or staff", () => {
    for (const table of PII_TABLES) {
      expect(canStore("kiosk", table)).toBe(false);
    }
  });

  it("never lets a KDS store order history, customers or staff", () => {
    for (const table of PII_TABLES) {
      expect(canStore("kds", table)).toBe(false);
    }
  });

  it("lets a kiosk store the menu — it is an ordering surface", () => {
    expect(canStore("kiosk", "menu_items")).toBe(true);
    expect(canStore("kiosk", "menu_categories")).toBe(true);
    expect(canStore("kiosk", "modifier_groups")).toBe(true);
  });

  it("does not give a KDS the menu — item names ride on the ticket", () => {
    expect(canStore("kds", "menu_items")).toBe(false);
  });

  it("lets every station keep its own sync bookkeeping", () => {
    expect(canStore("pos", "sync_state")).toBe(true);
    expect(canStore("kiosk", "sync_state")).toBe(true);
    expect(canStore("kds", "sync_state")).toBe(true);
  });
});

describe("forbiddenTables — the station-change purge list", () => {
  it("is empty for a POS", () => {
    expect(forbiddenTables("pos")).toEqual([]);
  });

  it("lists every PII table for a kiosk", () => {
    const forbidden = forbiddenTables("kiosk");
    expect(forbidden).toContain("orders");
    expect(forbidden).toContain("order_items");
    expect(forbidden).toContain("order_payments");
    expect(forbidden).toContain("customers");
    expect(forbidden).toContain("staff");
    expect(forbidden).not.toContain("menu_items");
  });

  it("lists the menu too for a KDS", () => {
    expect(forbiddenTables("kds")).toContain("menu_items");
    expect(forbiddenTables("kds")).toContain("orders");
  });

  /**
   * The invariant that makes the purge trustworthy: for any station kind,
   * allowed + forbidden covers every table a POS could hold. A table added to
   * the schema but forgotten in the policy would be neither allowed nor
   * purged — it would just quietly persist on a kiosk.
   */
  it("partitions every table into allowed or forbidden, for every station", () => {
    for (const kind of ["pos", "kiosk", "kds"] as const) {
      const forbidden = new Set(forbiddenTables(kind));
      for (const table of TABLES) {
        const allowed = canStore(kind, table);
        expect(allowed || forbidden.has(table)).toBe(true);
        expect(allowed && forbidden.has(table)).toBe(false);
      }
    }
  });
});
