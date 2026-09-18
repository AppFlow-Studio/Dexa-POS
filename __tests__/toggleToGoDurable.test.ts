/**
 * OrderService.toggleToGoOnItems — durability regression.
 *
 * Root cause of "TO GO drops after payment / send-to-kitchen": is_to_go is set
 * ONLY by toggle_to_go_order_items, and the old wrapper was a one-shot
 * fire-and-forget that CLEARED its pending-guard marker on any failure. A
 * transient bad-WiFi/offline error therefore lost the flag, and the next full
 * re-fetch (payment / kitchen send) reconciled the item back to the DB's false.
 *
 * These tests lock in the fix: a failed or offline persist must (1) queue a
 * durable `toggle_to_go` op and (2) KEEP the pending marker so an inbound fetch
 * can't clobber the optimistic value before the retry lands.
 */

// Bypass the deadline wrap — invoke the call fn directly with a no-op signal.
jest.mock("@/lib/network/runWithDeadline", () => ({
  runWithDeadline: jest.fn(
    async <T,>(
      _op: string,
      _ms: number,
      call: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>,
    ) => {
      const ac = new AbortController();
      return call(ac.signal);
    },
  ),
}));

// toggleToGoOnItems lazy-require()s these two — provide minimal mocks.
const mockQueueFailedOperation = jest.fn(
  async (..._args: any[]): Promise<string> => "op-id",
);
jest.mock("@/services/offlineSyncInit", () => ({
  queueFailedOperation: (...args: any[]) => mockQueueFailedOperation(...args),
}));

const mockOnline = { value: true };
jest.mock("@/services/offlineSyncService", () => ({
  getIsOnline: () => mockOnline.value,
}));

import { OrderService } from "@/services/orderService";
import { clearPendingToGo, resolveInboundToGo } from "@/lib/pendingToGo";

type RpcCapture = { name: string; params: Record<string, any> };

function buildClient(response: { data: any; error: any }): {
  client: any;
  captures: RpcCapture[];
} {
  const captures: RpcCapture[] = [];
  const client = {
    rpc: (name: string, params: Record<string, any>) => {
      captures.push({ name, params });
      return {
        abortSignal: (_signal: AbortSignal) => Promise.resolve(response),
      };
    },
  };
  return { client, captures };
}

// resolveInboundToGo(id, false) returns `true` only while a pending marker of
// `true` is still held (incoming=false ≠ desired=true → keep). It does NOT clear
// on this branch, so it's a non-destructive "is the marker retained?" probe.
const markerRetained = (id: string) => resolveInboundToGo(id, false) === true;

describe("OrderService.toggleToGoOnItems — durability", () => {
  beforeEach(() => {
    mockQueueFailedOperation.mockClear();
    mockOnline.value = true;
  });

  test("RPC error → queues toggle_to_go and KEEPS the pending marker", async () => {
    const { client, captures } = buildClient({
      data: null,
      error: { code: "DEADLINE_EXCEEDED", message: "slow" },
    });

    await OrderService.toggleToGoOnItems(client, ["db-err"], true, {
      localOrderId: "order-1",
      localItemIds: ["local-1"],
    });

    expect(captures).toHaveLength(1);
    expect(captures[0].name).toBe("toggle_to_go_order_items");
    expect(mockQueueFailedOperation).toHaveBeenCalledTimes(1);
    const [type, params, localOrderId] =
      mockQueueFailedOperation.mock.calls[0];
    expect(type).toBe("toggle_to_go");
    expect(params).toMatchObject({
      dbItemIds: ["db-err"],
      isToGo: true,
      localOrderId: "order-1",
      localItemIds: ["local-1"],
    });
    expect(localOrderId).toBe("order-1");
    expect(markerRetained("db-err")).toBe(true);
    clearPendingToGo(["db-err"]);
  });

  test("offline → queues immediately WITHOUT calling the RPC, marker kept", async () => {
    mockOnline.value = false;
    const { client, captures } = buildClient({ data: null, error: null });

    await OrderService.toggleToGoOnItems(client, ["db-off"], true, {
      localOrderId: "order-2",
      localItemIds: ["local-2"],
    });

    expect(captures).toHaveLength(0); // no doomed RPC while offline
    expect(mockQueueFailedOperation).toHaveBeenCalledTimes(1);
    expect(markerRetained("db-off")).toBe(true);
    clearPendingToGo(["db-off"]);
  });

  test("no db id yet + context → queues for the drain to resolve later", async () => {
    const { client, captures } = buildClient({ data: null, error: null });

    await OrderService.toggleToGoOnItems(client, [], true, {
      localOrderId: "order-3",
      localItemIds: ["local-3"],
    });

    expect(captures).toHaveLength(0);
    expect(mockQueueFailedOperation).toHaveBeenCalledTimes(1);
    const [, params] = mockQueueFailedOperation.mock.calls[0];
    expect(params).toMatchObject({ localItemIds: ["local-3"], isToGo: true });
  });

  test("success → no queue, no fallback clear", async () => {
    const { client, captures } = buildClient({ data: null, error: null });

    const res = await OrderService.toggleToGoOnItems(client, ["db-ok"], true, {
      localOrderId: "order-4",
      localItemIds: ["local-4"],
    });

    expect(captures).toHaveLength(1);
    expect(mockQueueFailedOperation).not.toHaveBeenCalled();
    expect(res.error).toBeNull();
    clearPendingToGo(["db-ok"]);
  });

  test("error with NO context → last-resort clears the marker (nothing to queue)", async () => {
    const { client } = buildClient({
      data: null,
      error: { code: "X", message: "boom" },
    });

    await OrderService.toggleToGoOnItems(client, ["db-noctx"], true);

    expect(mockQueueFailedOperation).not.toHaveBeenCalled();
    // Marker cleared → resolveInboundToGo falls back to the incoming value.
    expect(markerRetained("db-noctx")).toBe(false);
  });
});
