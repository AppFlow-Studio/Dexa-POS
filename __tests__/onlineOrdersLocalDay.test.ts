import { readFileSync } from "fs";
import { join } from "path";

import {
  assembleOnlineOrderBoard,
  getMissingActiveOnlineOrderIds,
  isActiveOnlineOrderStatus,
  reconcileOnlineOrderSnapshot,
} from "@/lib/onlineOrderBoard";
import type { OrderProfile } from "@/lib/types";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260804120000_online_orders_board_local_day.sql",
  ),
  "utf8",
);

function order(
  id: string,
  status: OrderProfile["order_status"],
  openedAt: string,
): OrderProfile {
  return {
    id,
    db_order_id: id,
    order_status: status,
    opened_at: openedAt,
  } as OrderProfile;
}

function selection(
  orderId: string,
  placedAt: string | null,
  isInRange: boolean,
) {
  return { orderId, placedAt, isInRange, itemCount: 0, orderData: {} };
}

describe("Online Orders location-local day contract", () => {
  it("uses independent location-local midnight bounds and placed_at", () => {
    expect(migration).toContain(
      "v_start_date::timestamp AT TIME ZONE v_timezone",
    );
    expect(migration).toContain(
      "(v_end_date + 1)::timestamp AT TIME ZONE v_timezone",
    );
    expect(migration).toContain("online_order_rows.placed_at >= v_start_ts");
    expect(migration).toContain("online_order_rows.placed_at < v_end_ts");
    expect(migration).not.toContain("business_day_start_hour");
    expect(migration).toContain("SELECT DISTINCT ON (oo.order_id)");
    expect(migration).toContain("to_jsonb(o) || jsonb_build_object");
    expect(migration).not.toContain("LIMIT v_limit");
  });

  it("recognizes the complete active online-order status set", () => {
    for (const status of [
      "pending",
      "accepted",
      "sent_to_kitchen",
      "preparing",
      "ready",
    ]) {
      expect(isActiveOnlineOrderStatus(status)).toBe(true);
      expect(migration).toContain(`'${status}'`);
    }
    expect(isActiveOnlineOrderStatus("completed")).toBe(false);
  });

  it("keeps only in-range rows (drops out-of-range active and completed)", () => {
    const outActive = order("out-active", "preparing", "2026-07-25T23:58:00Z");
    const inRangeDone = order("done-in", "completed", "2026-07-26T00:10:00Z");
    const outOfRangeDone = order(
      "done-out",
      "completed",
      "2026-07-25T23:57:00Z",
    );
    const ordersById = {
      "out-active": outActive,
      "done-in": inRangeDone,
      "done-out": outOfRangeDone,
    };

    const result = assembleOnlineOrderBoard(
      [
        selection("out-active", outActive.opened_at, false),
        selection("done-in", inRangeDone.opened_at, true),
        selection("done-out", outOfRangeDone.opened_at, false),
      ],
      ordersById,
      [],
    );

    // Strict scope: only the in-range row survives — an out-of-range order is
    // dropped whether it's still active or already completed.
    expect(result.map((item) => item.id)).toEqual(["done-in"]);
  });

  it("drops out-of-range active orders (strict scope)", () => {
    const outActive = order("out-active", "preparing", "2026-07-25T23:58:00Z");
    const inDone = order("done-in", "completed", "2026-07-26T00:10:00Z");
    const inActive = order("in-active", "ready", "2026-07-26T09:00:00Z");
    const ordersById = {
      "out-active": outActive,
      "done-in": inDone,
      "in-active": inActive,
    };

    const result = assembleOnlineOrderBoard(
      [
        selection("out-active", outActive.opened_at, false),
        selection("done-in", inDone.opened_at, true),
        selection("in-active", inActive.opened_at, true),
      ],
      ordersById,
      [outActive], // a live active order must not leak onto any tab
    );

    // Out-of-range active dropped; only in-range rows (active or completed)
    // kept, newest placed_at first.
    expect(result.map((item) => item.id)).toEqual(["in-active", "done-in"]);
  });

  it("scopes strictly by the business day (RPC)", () => {
    const boundedMigration = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260817120000_online_orders_board_business_day_strict.sql",
      ),
      "utf8",
    );
    // Business-day window (honors the rollover hour), not calendar midnight.
    expect(boundedMigration).toContain("business_day_start_hour");
    expect(boundedMigration).toContain("make_interval(hours => v_start_hour)");
    // Strict scope by placed_at, with no active-status carryover branch.
    expect(boundedMigration).toContain(
      "online_order_rows.placed_at >= v_start_ts",
    );
    expect(boundedMigration).toContain(
      "online_order_rows.placed_at < v_end_ts",
    );
    expect(boundedMigration).not.toContain("v_include_active");
  });

  it("adds a realtime active order once while the RPC refresh is in flight", () => {
    const active = order("active", "ready", "2026-07-26T00:10:00Z");
    const result = assembleOnlineOrderBoard(
      [selection("active", active.opened_at, true)],
      { active },
      [active],
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("active");
  });

  it("identifies a realtime active order missing from the RPC snapshot", () => {
    const selected = order("selected", "preparing", "2026-07-26T00:10:00Z");
    const arrived = order("arrived", "pending", "2026-07-26T00:11:00Z");
    const completed = order("completed", "completed", "2026-07-26T00:12:00Z");

    expect(
      getMissingActiveOnlineOrderIds(
        [selection("selected", selected.opened_at, true)],
        [selected, arrived, completed, arrived],
      ),
    ).toEqual(["arrived"]);
  });

  it("uses a newer completed server snapshot over stale active local state", () => {
    const existing = order("order-1", "preparing", "2026-07-26T00:10:00Z");
    existing.items = [{ id: "existing-item" }] as any;
    const incoming = order("order-1", "completed", "2026-07-26T00:10:00Z");
    incoming.items = [];

    const reconciled = reconcileOnlineOrderSnapshot(existing, incoming);

    expect(reconciled.order_status).toBe("completed");
    expect(reconciled.items).toEqual(existing.items);
  });

  it("does not let a lagging server snapshot revert an optimistic ready step", () => {
    const existing = order("order-1", "ready", "2026-07-26T00:10:00Z");
    existing.items = [];
    const incoming = order("order-1", "preparing", "2026-07-26T00:10:00Z");
    incoming.items = [];

    expect(reconcileOnlineOrderSnapshot(existing, incoming).order_status).toBe(
      "ready",
    );
  });

  it("keeps locally-known Today completions during the initial offline load", () => {
    const completed = order("completed", "completed", "2026-07-26T00:10:00Z");
    completed.items = [];

    expect(
      assembleOnlineOrderBoard([], { completed }, [completed], {
        includeLiveCompleted: true,
      }),
    ).toEqual([completed]);
    expect(assembleOnlineOrderBoard([], { completed }, [completed])).toEqual(
      [],
    );
  });
});
