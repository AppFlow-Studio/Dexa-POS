/**
 * Shared-till exit guard — what leaving Sales does with "Require PIN per order".
 *
 * The guard only acts on a live QSR order at a staffed register; everything
 * else must leave exactly as before ("navigate"). An order with unsent items
 * asks first ("prompt"); anything else hands the till over ("reset").
 */
import {
  countUnsentItems,
  getSalesExitDecision,
} from "@/lib/salesExitGuard";
import type { CartItem, OrderProfile } from "@/lib/types";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return { id: `i-${Math.random()}`, ...overrides } as CartItem;
}

function order(overrides: Partial<OrderProfile> = {}): OrderProfile {
  return {
    id: "o-1",
    order_type: "takeout",
    service_location_id: null,
    order_status: "draft",
    paid_status: "Unpaid",
    check_status: "Opened",
    items: [],
    ...overrides,
  } as OrderProfile;
}

const on = { requirePinPerOrder: true, isKiosk: false };

describe("getSalesExitDecision", () => {
  it("leaves untouched when the setting is off", () => {
    expect(
      getSalesExitDecision({
        requirePinPerOrder: false,
        isKiosk: false,
        order: order({ items: [item({ kitchen_status: "new" })] }),
      }),
    ).toBe("navigate");
  });

  it("leaves untouched on a kiosk", () => {
    expect(
      getSalesExitDecision({ ...on, isKiosk: true, order: order() }),
    ).toBe("navigate");
  });

  it("leaves untouched with no active order", () => {
    expect(getSalesExitDecision({ ...on, order: null })).toBe("navigate");
  });

  it("leaves dine-in table orders untouched", () => {
    expect(
      getSalesExitDecision({ ...on, order: order({ order_type: "dine_in" }) }),
    ).toBe("navigate");
    expect(
      getSalesExitDecision({
        ...on,
        order: order({ service_location_id: "table-1" }),
      }),
    ).toBe("navigate");
  });

  it("leaves paid, closed and final orders untouched", () => {
    expect(
      getSalesExitDecision({ ...on, order: order({ paid_status: "Paid" }) }),
    ).toBe("navigate");
    expect(
      getSalesExitDecision({ ...on, order: order({ check_status: "Closed" }) }),
    ).toBe("navigate");
    expect(
      getSalesExitDecision({ ...on, order: order({ order_status: "void" }) }),
    ).toBe("navigate");
  });

  it("resets an empty draft", () => {
    expect(getSalesExitDecision({ ...on, order: order() })).toBe("reset");
  });

  it("resets when every item was sent", () => {
    expect(
      getSalesExitDecision({
        ...on,
        order: order({
          order_status: "sent_to_kitchen",
          items: [
            item({ kitchen_status: "sent" }),
            item({ kitchen_status: "ready" }),
          ],
        }),
      }),
    ).toBe("reset");
  });

  it("prompts when items are unsent", () => {
    expect(
      getSalesExitDecision({
        ...on,
        order: order({
          items: [item({ kitchen_status: "sent" }), item({ kitchen_status: "new" })],
        }),
      }),
    ).toBe("prompt");
    expect(
      getSalesExitDecision({ ...on, order: order({ items: [item()] }) }),
    ).toBe("prompt");
  });

  it("ignores the draft item still open in the modifier sidebar", () => {
    expect(
      getSalesExitDecision({
        ...on,
        order: order({ items: [item({ isDraft: true })] }),
      }),
    ).toBe("reset");
  });
});

describe("countUnsentItems", () => {
  it("counts new and status-less items, skipping drafts and sent items", () => {
    expect(
      countUnsentItems(
        order({
          items: [
            item(),
            item({ kitchen_status: "new" }),
            item({ kitchen_status: "new", isDraft: true }),
            item({ kitchen_status: "preparing" }),
          ],
        }),
      ),
    ).toBe(2);
    expect(countUnsentItems(null)).toBe(0);
  });
});
