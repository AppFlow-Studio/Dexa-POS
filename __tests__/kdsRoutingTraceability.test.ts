import { readFileSync } from "fs";
import { join } from "path";
import {
  buildKitchenSendQueueParams,
  createKitchenSendContext,
  KITCHEN_ITEMS_UNRESOLVED,
  KITCHEN_NO_ACTIVE_ROUTE,
  KITCHEN_TRACE_CONTRACT_MISMATCH,
  validateKitchenMutationResult,
} from "@/lib/kdsSendTraceability";

jest.mock("uuid", () => ({
  v4: jest.fn(() => "55555555-5555-4555-8555-555555555555"),
}));

const repoRoot = join(__dirname, "..");

describe("KDS send traceability contract", () => {
  const context = createKitchenSendContext({
    stationId: "11111111-1111-4111-8111-111111111111",
    deviceId: "device-a",
    staffId: "22222222-2222-4222-8222-222222222222",
    sendIdempotencyKey: "33333333-3333-4333-8333-333333333333",
    itemsIdempotencyKey: "44444444-4444-4444-8444-444444444444",
  });

  it("preserves station, device, staff, item IDs, and operation keys in queue payloads", () => {
    const localItemIds = ["local-a", "local-b"];
    const payload = buildKitchenSendQueueParams(
      "local-order",
      localItemIds,
      context,
      { orderStatus: "sent_to_kitchen", itemStatus: "sent" },
      { offline_batch: true },
    );

    localItemIds.push("mutated-after-build");

    expect(payload).toMatchObject({
      localOrderId: "local-order",
      localItemIds: ["local-a", "local-b"],
      stationId: context.stationId,
      deviceId: context.deviceId,
      staffId: context.staffId,
      itemsIdempotencyKey: context.itemsIdempotencyKey,
      orderStatus: "sent_to_kitchen",
      itemStatus: "sent",
      offline_batch: true,
    });
    expect(context.sendIdempotencyKey).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("accepts a complete online send", () => {
    expect(
      validateKitchenMutationResult(
        { requested_count: 2, updated_count: 2, kds_updated_count: 2 },
        2,
        {
          operation: "send",
          orderId: "order-a",
          stationId: context.stationId,
          deviceId: context.deviceId,
          replay: false,
          requireExplicitCounts: true,
        },
      ),
    ).toBeNull();
  });

  it("rejects a partial send instead of reporting unconditional success", () => {
    const error = validateKitchenMutationResult(
      { requested_count: 2, updated_count: 1, kds_updated_count: 1 },
      2,
      {
        operation: "send",
        orderId: "order-a",
        stationId: context.stationId,
        deviceId: context.deviceId,
        replay: false,
        requireExplicitCounts: true,
      },
    );

    expect(error).toMatchObject({
      code: KITCHEN_ITEMS_UNRESOLVED,
      details: {
        orderId: "order-a",
        requestedCount: 2,
        updatedCount: 1,
        replay: false,
      },
    });
  });

  it("re-checks a cached replay response instead of treating it as new success", () => {
    const cachedReplay = {
      requested_count: 2,
      updated_count: 1,
      kds_updated_count: 1,
    };
    const error = validateKitchenMutationResult(cachedReplay, 2, {
      operation: "send",
      orderId: "order-a",
      replay: true,
      requireExplicitCounts: true,
    });

    expect(error?.code).toBe(KITCHEN_ITEMS_UNRESOLVED);
    expect(error?.details.replay).toBe(true);
  });

  it("fails clearly when the shared migration count contract is absent", () => {
    const error = validateKitchenMutationResult(
      { updated_count: 2 },
      2,
      {
        operation: "send",
        orderId: "order-a",
        requireExplicitCounts: true,
      },
    );

    expect(error?.code).toBe(KITCHEN_TRACE_CONTRACT_MISMATCH);
  });

  it("rejects a send when no KDS destination row was updated", () => {
    const error = validateKitchenMutationResult(
      { requested_count: 2, updated_count: 2, kds_updated_count: 0 },
      2,
      {
        operation: "send",
        orderId: "order-a",
        requireExplicitCounts: true,
      },
    );

    expect(error?.code).toBe(KITCHEN_NO_ACTIVE_ROUTE);
  });
});

describe("POS kitchen-send wiring", () => {
  const orderService = readFileSync(
    join(repoRoot, "services", "orderService.ts"),
    "utf8",
  );
  const replay = readFileSync(
    join(repoRoot, "services", "offlineSyncInit.ts"),
    "utf8",
  );
  const tableEffect = readFileSync(
    join(repoRoot, "services", "sessionEffects", "sendToKitchenEffect.ts"),
    "utf8",
  );
  const generatedTypes = readFileSync(
    join(repoRoot, "database.types.ts"),
    "utf16le",
  );

  it("sends station/device and both idempotency keys to the composite RPC", () => {
    expect(orderService).toContain('.rpc("send_order_to_kitchen_v1"');
    expect(orderService).toContain("p_station_id: opts.stationId");
    expect(orderService).toContain("p_device_id: opts.deviceId");
    expect(orderService).toContain(
      "p_idempotency_key: opts.idempotencyKey",
    );
    expect(orderService).toContain(
      "p_items_idempotency_key: opts.itemsIdempotencyKey",
    );
  });

  it("persists replay context and reuses the queue operation key", () => {
    expect(replay).toContain("op.idempotencyKey");
    expect(replay).toContain("await updateOperationParams(op.id");
    expect(replay).toContain("itemsIdempotencyKey:");
    expect(replay).toContain("hasPersistedAttemptItems");
    expect(replay).toContain("resolvedItemIds,");
    expect(replay).toContain("unresolvedLocalItemIds,");
    expect(replay).toContain("replay: true");
  });

  it("uses the composite RPC for the table-session send path", () => {
    expect(tableEffect).toContain("OrderService.sendOrderToKitchen(");
    expect(tableEffect).not.toContain(
      "OrderService.bulkUpdateOrderItemStatus(",
    );
  });

  it("includes the shared RPC client context in generated POS types", () => {
    const start = generatedTypes.indexOf("send_order_to_kitchen_v1:");
    const end = generatedTypes.indexOf("set_item_course:", start);
    const signature = generatedTypes.slice(start, end);

    expect(signature).toContain("p_station_id?: string;");
    expect(signature).toContain("p_device_id?: string;");
  });
});
