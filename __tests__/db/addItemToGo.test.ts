/**
 * A regular item's TO GO flag in the local-first add_item drain.
 *
 * add_order_item_v5 has no p_is_to_go, so the flag rides a second call. It
 * must land BEFORE the cart line binds: a bound line is routed by the kitchen
 * send, so binding first let a Send in the gap reach the kitchen without TO GO
 * and log "[LF] ✗ kitchen send: … not synced" for an item the server had.
 */
const mockBind = jest.fn();
jest.mock("@/stores/useOrderStore", () => ({
  markItemSyncedFromDrain: (...args: unknown[]) => mockBind(...args),
}));
const mockToggle = jest.fn(async (..._args: unknown[]) => ({
  data: null,
  error: null,
}));
jest.mock("@/services/orderService", () => ({
  OrderService: {
    toggleToGoOnItems: (...args: unknown[]) => mockToggle(...args),
  },
}));

import type { ClaimedOp } from "@/lib/db/outbox";
import { clearPendingToGo, resolveInboundToGo } from "@/lib/pendingToGo";
import { makeOpHandlers } from "@/services/localFirst/opHandlers";

const ROW = "44444444-4444-4444-8444-444444444444";

function toGoAdd(attempts: number): ClaimedOp {
  return {
    id: "op-togo",
    op: "add_item",
    entity: "order_item",
    entityId: ROW,
    orderId: "o1",
    payload: {
      orderId: "o1",
      itemName: "Iced Latte",
      quantity: 1,
      unitPrice: 5,
      isToGo: true,
      cartItemId: "cart|latte_1",
    },
    attempts,
  } as unknown as ClaimedOp;
}

/** Records RPCs and the cart binding in one timeline. */
function server(toGoError: unknown = null) {
  const timeline: string[] = [];
  const client = {
    rpc: jest.fn(async (name: string) => {
      timeline.push(name);
      if (name === "toggle_to_go_order_items" && toGoError) {
        return { data: null, error: toGoError };
      }
      return { data: {}, error: null };
    }),
  };
  mockBind.mockImplementation(() => timeline.push("bind"));
  return { client: client as any, timeline };
}

beforeEach(() => {
  mockBind.mockReset();
  mockToggle.mockClear();
  clearPendingToGo([ROW]);
});

it("flags the row before binding the cart line", async () => {
  const { client, timeline } = server();
  const outcome = await makeOpHandlers(client).add_item!(toGoAdd(0));

  expect(outcome.kind).toBe("synced");
  expect(timeline).toEqual([
    "add_order_item_v5",
    "toggle_to_go_order_items",
    "bind",
  ]);
});

it("keeps the line unbound while a failed flag retries", async () => {
  const { client, timeline } = server({ message: "Network request failed" });
  const outcome = await makeOpHandlers(client).add_item!(toGoAdd(0));

  expect(outcome.kind).toBe("retry");
  expect(timeline).not.toContain("bind");
  // A fetch in the meantime can't wipe the tablet's badge.
  expect(resolveInboundToGo(ROW, false)).toBe(true);
});

it("stops holding the line back after repeated failures", async () => {
  const { client, timeline } = server({ message: "Network request failed" });
  const outcome = await makeOpHandlers(client).add_item!(toGoAdd(2));

  // The food goes; the flag carries on in the durable to-go queue.
  expect(outcome.kind).toBe("synced");
  expect(timeline).toContain("bind");
  expect(mockToggle).toHaveBeenCalledWith(client, [ROW], true, {
    localOrderId: "o1",
    localItemIds: ["cart|latte_1"],
  });
});
