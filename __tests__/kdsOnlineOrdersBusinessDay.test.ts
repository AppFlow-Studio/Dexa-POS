/**
 * KDS online-orders drawer is bounded to the current business day, like the
 * POS drawer. Before, the KDS bootstrap loaded every online order still in an
 * active status from ANY day (75 stale orders on a staging board), and cards
 * showed a time with no date, so they read as current.
 */
import fs from "fs";
import path from "path";

import { formatOrderTime } from "@/lib/onlineOrderLabel";

describe("formatOrderTime", () => {
  const now = new Date(2026, 8, 23, 15, 0); // Sep 23 2026, 3:00 PM local

  it("shows only the time for an order placed today", () => {
    const iso = new Date(2026, 8, 23, 14, 5).toISOString();
    expect(formatOrderTime(iso, now)).toBe("2:05 PM");
  });

  it("prefixes the date for an order from another day", () => {
    const iso = new Date(2026, 8, 21, 9, 30).toISOString();
    expect(formatOrderTime(iso, now)).toBe("Sep 21 · 9:30 AM");
  });

  it("returns empty for missing or invalid timestamps", () => {
    expect(formatOrderTime(null, now)).toBe("");
    expect(formatOrderTime("not-a-date", now)).toBe("");
  });
});

describe("KDS online-orders bootstrap query (source)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "hooks", "pos", "useKdsOnlineOrdersBootstrap.ts"),
    "utf8",
  );

  it("floors the fetch at the business-day start the POS uses", () => {
    expect(src).toMatch(/import \{ resolveBusinessDayStartUtc \} from "@\/hooks\/pos\/useOrdersQuery"/);
    expect(src).toMatch(/q = q\.gte\("created_at", businessDayStartUtc\)/);
  });

  it("prunes earlier-business-day online orders after each successful fetch", () => {
    expect(src).toMatch(/pruneEarlierBusinessDayOnlineOrders\(\s*businessDayStartUtc,/);
  });
});

describe("pruneEarlierBusinessDayOnlineOrders", () => {
  type Order = {
    db_order_id?: string;
    order_source: string;
    opened_at: string;
  };

  function load(ordersById: Record<string, Order>) {
    const removeOrder = jest.fn();
    let prune!: typeof import("@/hooks/pos/useKdsOnlineOrdersBootstrap").pruneEarlierBusinessDayOnlineOrders;
    jest.isolateModules(() => {
      jest.doMock("@/stores/useOrderStore", () => ({
        useOrderStore: {
          getState: () => ({
            ordersById,
            orderIds: Object.keys(ordersById),
            removeOrder,
          }),
        },
      }));
      jest.doMock("@/hooks/pos/useOrdersQuery", () => ({
        resolveBusinessDayStartUtc: () => null,
      }));
      jest.doMock("@/hooks/useSupabaseClient", () => ({
        useSupabaseClient: () => null,
      }));
      jest.doMock("@/lib/network/withDeadline", () => ({ withDeadline: jest.fn() }));
      jest.doMock("@/utils/orderTransformers", () => ({
        normalizeFetchedOrder: (o: unknown) => o,
      }));
      prune = require("@/hooks/pos/useKdsOnlineOrdersBootstrap")
        .pruneEarlierBusinessDayOnlineOrders;
    });
    return { prune, removeOrder };
  }

  const dayStart = "2026-09-23T04:00:00.000Z";

  it("removes online orders from before the business day that the fetch no longer returns", () => {
    const { prune, removeOrder } = load({
      old: { db_order_id: "old", order_source: "online_store", opened_at: "2026-09-20T18:00:00.000Z" },
      today: { db_order_id: "today", order_source: "orderout", opened_at: "2026-09-23T12:00:00.000Z" },
    });
    prune(dayStart, new Set(["today"]));
    expect(removeOrder).toHaveBeenCalledTimes(1);
    expect(removeOrder).toHaveBeenCalledWith("old");
  });

  it("keeps an earlier order the fetch still returns, and never touches non-online orders", () => {
    const { prune, removeOrder } = load({
      stillActive: { db_order_id: "stillActive", order_source: "online", opened_at: "2026-09-22T23:00:00.000Z" },
      posOrder: { db_order_id: "posOrder", order_source: "pos", opened_at: "2026-09-01T12:00:00.000Z" },
    });
    prune(dayStart, new Set(["stillActive"]));
    expect(removeOrder).not.toHaveBeenCalled();
  });
});
