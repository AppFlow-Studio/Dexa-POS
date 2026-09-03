import { getOrderStatusAfterKitchenSend } from "@/lib/kitchenStatusUtils";
import { readFileSync } from "fs";
import { join } from "path";

jest.mock("@/stores/useLocationConfigStore", () => ({
  useLocationConfigStore: {
    getState: () => ({ config: { kds: { workflowMode: "3-step" } } }),
  },
}));

const storeSource = readFileSync(
  join(__dirname, "..", "stores", "useOrderStore.ts"),
  "utf8",
);
const latestKitchenStatusMigration = readFileSync(
  join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260827160000_fix_kds_refire_preserves_fire_time.sql",
  ),
  "utf8",
);

describe("late kitchen item parent-status reconciliation", () => {
  it.each(["draft", "pending", "sent_to_kitchen", "preparing", "ready"] as const)(
    "moves an open %s order into the new three-step kitchen cycle",
    (status) => {
      expect(
        getOrderStatusAfterKitchenSend(status, "Opened", "sent_to_kitchen"),
      ).toBe("sent_to_kitchen");
    },
  );

  it("reopens an open locally-completed kitchen cycle", () => {
    expect(
      getOrderStatusAfterKitchenSend(
        "completed",
        "Opened",
        "sent_to_kitchen",
      ),
    ).toBe("sent_to_kitchen");
  });

  it("uses preparing for a two-step kitchen cycle", () => {
    expect(
      getOrderStatusAfterKitchenSend("ready", "Opened", "preparing"),
    ).toBe("preparing");
  });

  it.each(["void", "cancelled", "refunded", "declined"] as const)(
    "does not reopen terminal %s orders",
    (status) => {
      expect(
        getOrderStatusAfterKitchenSend(status, "Opened", "sent_to_kitchen"),
      ).toBe(status);
    },
  );

  it("does not reopen a closed check", () => {
    expect(
      getOrderStatusAfterKitchenSend(
        "completed",
        "Closed",
        "sent_to_kitchen",
      ),
    ).toBe("completed");
  });

  it("wires the resolver into every optimistic kitchen-send path", () => {
    const calls = storeSource.match(/getOrderStatusAfterKitchenSend\(/g) ?? [];

    // Payment-fired items, table/course sends, the active order send, and the
    // explicit-order send all share the same parent lifecycle transition.
    expect(calls).toHaveLength(4);
  });

  it("keeps sent/preparing table sends out of the stale ready aggregate", () => {
    expect(storeSource).toMatch(
      /status !== "sent" &&\s+status !== "preparing" &&\s+order\.order_type === "dine_in"/,
    );
  });

  it("keeps the server parent-status aggregate aligned with a late send", () => {
    expect(latestKitchenStatusMigration).toMatch(
      /WHEN p_status = 'sent'\s+AND o\.status::text IN \('ready', 'preparing'\)\s+THEN 'sent_to_kitchen'/,
    );
    expect(latestKitchenStatusMigration).toContain(
      "WHEN agg.any_beyond_sent THEN 'preparing'::public.order_status",
    );
  });
});
