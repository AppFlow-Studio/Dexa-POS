/**
 * kdsDeviceTruth — device-truth emitter (Architecture B, 80/20).
 *
 * Structural + behavioural assertions on the emitter that feeds
 * report_kds_device_events. The module is pure TypeScript (no React Native
 * runtime deps), so the Supabase client is a jest mock and the full batching /
 * dedupe / retry contract is exercised without a device or a queue:
 *
 *   - each item is emitted at most once per session (arrived and ack are
 *     separate signals)
 *   - the batch flushes set-based in ONE rpc call
 *   - a failed flush keeps the ORIGINAL client_event_at so the server's unique
 *     index makes the retry a no-op, not a duplicate
 *   - switching displays discards the previous display's buffer
 *   - the batch is capped so an offline backlog cannot grow unbounded
 */

import {
  setKdsDeviceTruthContext,
  resetKdsDeviceTruth,
  markKdsItemArrived,
  markKdsItemAcked,
  hasPendingKdsDeviceTruth,
  flushKdsDeviceTruth,
} from "../services/kds/kdsDeviceTruth";

type RpcMock = jest.Mock<Promise<{ error: { message: string } | null }>>;

function makeSupabase() {
  const rpc = jest.fn(async () => ({ error: null })) as unknown as RpcMock;
  return { rpc, client: { rpc } as never };
}

beforeEach(() => {
  resetKdsDeviceTruth();
});

describe("kdsDeviceTruth emitter", () => {
  it("does not enqueue anything without a display context", async () => {
    const { rpc, client } = makeSupabase();
    markKdsItemArrived("item-1", "order-1");
    markKdsItemAcked("item-1", "order-1");

    expect(hasPendingKdsDeviceTruth()).toBe(false);
    await flushKdsDeviceTruth(client);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marks an item arrived at most once per session", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1");
    markKdsItemArrived("item-1", "order-1"); // re-mark after a re-render
    await flushKdsDeviceTruth(client);

    expect(rpc).toHaveBeenCalledTimes(1);
    const payload = rpc.mock.calls[0][1] as {
      p_kds_display_id: string;
      p_events: { order_item_id: string; event_type: string }[];
    };
    expect(payload.p_kds_display_id).toBe("display-1");
    expect(payload.p_events).toHaveLength(1);
    expect(payload.p_events[0]).toMatchObject({
      order_item_id: "item-1",
      order_id: "order-1",
      event_type: "arrived",
    });
  });

  it("sends arrived and ack as separate events in one set-based batch", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1");
    markKdsItemArrived("item-2", "order-1");
    markKdsItemAcked("item-1", "order-1");

    await flushKdsDeviceTruth(client);

    expect(rpc).toHaveBeenCalledTimes(1);
    const payload = rpc.mock.calls[0][1] as {
      p_events: { order_item_id: string; event_type: string }[];
      p_device_origin_id: string;
      p_app_version: string;
    };
    expect(payload.p_events).toHaveLength(3);
    expect(payload.p_events.map((e) => e.event_type).sort()).toEqual([
      "ack",
      "arrived",
      "arrived",
    ]);
    expect(payload.p_device_origin_id).toBe("dev-1");
    expect(payload.p_app_version).toBe("1.0.0");
  });

  it("clears the batch only after a successful flush", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1");
    await flushKdsDeviceTruth(client);
    expect(hasPendingKdsDeviceTruth()).toBe(false);

    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(1); // nothing left to send
  });

  it("keeps the batch with its ORIGINAL client_event_at on failure for a safe retry", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1");

    // First flush fails (offline, RPC error).
    (rpc as unknown as RpcMock).mockResolvedValueOnce({
      error: { message: "offline" },
    });
    await flushKdsDeviceTruth(client);
    expect(hasPendingKdsDeviceTruth()).toBe(true);

    // Second flush retries with the same idempotency key.
    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(2);
    const first = rpc.mock.calls[0][1] as { p_events: { client_event_at: string }[] };
    const second = rpc.mock.calls[1][1] as { p_events: { client_event_at: string }[] };
    expect(second.p_events[0].client_event_at).toBe(
      first.p_events[0].client_event_at
    );
    expect(hasPendingKdsDeviceTruth()).toBe(false);
  });

  it("discards the previous display's buffer on display switch", async () => {
    const { rpc, client } = makeSupabase();

    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");
    markKdsItemArrived("item-1", "order-1");
    expect(hasPendingKdsDeviceTruth()).toBe(true);

    setKdsDeviceTruthContext("display-2", "dev-2", "1.0.0");
    expect(hasPendingKdsDeviceTruth()).toBe(false);

    markKdsItemAcked("item-1", "order-1");
    await flushKdsDeviceTruth(client);
    const payload = rpc.mock.calls[0][1] as { p_kds_display_id: string };
    expect(payload.p_kds_display_id).toBe("display-2");
  });

  it("caps a pathological backlog so a flush stays bounded", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    for (let i = 0; i < 2000; i++) {
      markKdsItemArrived(`item-${i}`, "order-1");
    }

    await flushKdsDeviceTruth(client);
    const payload = rpc.mock.calls[0][1] as { p_events: unknown[] };
    // MAX_PENDING_EVENTS bounds a flush regardless of how far behind the
    // device fell; the diff only needs the first claim per item anyway.
    expect(payload.p_events.length).toBeLessThanOrEqual(500);
  });
});
