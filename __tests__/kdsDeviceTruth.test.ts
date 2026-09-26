/**
 * kdsDeviceTruth — device-truth emitter (Architecture B, 80/20).
 *
 * Structural + behavioural assertions on the emitter that feeds
 * report_kds_device_events. The module is pure TypeScript (no React Native
 * runtime deps), so the Supabase client is a jest mock, MMKV is a Map, and
 * the full batching / dedupe / retry / persistence contract is exercised
 * without a device or a queue:
 *
 *   - each item is emitted at most once per DISPLAY (arrived and ack are
 *     separate signals) — and that survives a remount / restart, so a
 *     rehydrated board does not re-claim items it already reported
 *   - every `arrived` carries the delivery path (`source`)
 *   - the batch flushes set-based, chunked at MAX_EVENTS_PER_CALL per call,
 *     never evicting (the old cap dropped the OLDEST = first-arrival rows)
 *   - a failed flush keeps the ORIGINAL client_event_at so the server's unique
 *     index makes the retry a no-op, not a duplicate — across restarts too
 *   - switching displays discards the previous display's in-memory buffer
 */

const mockStore = new Map<string, string>();
jest.mock("@/lib/storage", () => ({
  getJSON: <T,>(key: string): T | null => {
    const raw = mockStore.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  setJSON: <T,>(key: string, value: T): void => {
    mockStore.set(key, JSON.stringify(value));
  },
  removeKey: (key: string): void => {
    mockStore.delete(key);
  },
}));

import {
  __clearKdsDeviceTruthForTest,
  flushKdsDeviceTruth,
  getPendingKdsDeviceTruthCount,
  hasPendingKdsDeviceTruth,
  markKdsItemAcked,
  markKdsItemArrived,
  MAX_EVENTS_PER_CALL,
  resetKdsDeviceTruth,
  setKdsDeviceTruthContext,
} from "../services/kds/kdsDeviceTruth";

type RpcMock = jest.Mock<Promise<{ error: { message: string } | null }>>;

interface Payload {
  p_kds_display_id: string;
  p_events: {
    order_item_id: string;
    order_id: string | null;
    event_type: string;
    client_event_at: string;
    source?: string;
  }[];
  p_device_origin_id: string;
  p_app_version: string;
}

function makeSupabase() {
  const rpc = jest.fn(async () => ({ error: null })) as unknown as RpcMock;
  return { rpc, client: { rpc } as never };
}

function payloadOf(rpc: RpcMock, call = 0): Payload {
  return rpc.mock.calls[call][1] as unknown as Payload;
}

beforeEach(() => {
  __clearKdsDeviceTruthForTest();
  mockStore.clear();
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

  it("marks an item arrived at most once, tagged with its delivery path", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1", "broadcast");
    markKdsItemArrived("item-1", "order-1", "poll"); // re-mark after a re-render
    await flushKdsDeviceTruth(client);

    expect(rpc).toHaveBeenCalledTimes(1);
    const payload = payloadOf(rpc);
    expect(payload.p_kds_display_id).toBe("display-1");
    expect(payload.p_events).toHaveLength(1);
    expect(payload.p_events[0]).toMatchObject({
      order_item_id: "item-1",
      order_id: "order-1",
      event_type: "arrived",
      source: "broadcast",
    });
  });

  it("defaults the source to 'unknown' and never tags acks", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1");
    markKdsItemAcked("item-1", "order-1");
    await flushKdsDeviceTruth(client);

    const events = payloadOf(rpc).p_events;
    expect(events.find((e) => e.event_type === "arrived")?.source).toBe("unknown");
    expect(events.find((e) => e.event_type === "ack")?.source).toBeUndefined();
  });

  it("sends arrived and ack as separate events in one set-based batch", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1", "mount");
    markKdsItemArrived("item-2", "order-1", "mount");
    markKdsItemAcked("item-1", "order-1");

    await flushKdsDeviceTruth(client);

    expect(rpc).toHaveBeenCalledTimes(1);
    const payload = payloadOf(rpc);
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

    markKdsItemArrived("item-1", "order-1", "poll");
    await flushKdsDeviceTruth(client);
    expect(hasPendingKdsDeviceTruth()).toBe(false);

    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(1); // nothing left to send
  });

  it("keeps the batch with its ORIGINAL client_event_at on failure for a safe retry", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    markKdsItemArrived("item-1", "order-1", "poll");

    // First flush fails (offline, RPC error).
    (rpc as unknown as RpcMock).mockResolvedValueOnce({
      error: { message: "offline" },
    });
    await flushKdsDeviceTruth(client);
    expect(hasPendingKdsDeviceTruth()).toBe(true);

    // Second flush retries with the same idempotency key.
    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(payloadOf(rpc, 1).p_events[0].client_event_at).toBe(
      payloadOf(rpc, 0).p_events[0].client_event_at,
    );
    expect(hasPendingKdsDeviceTruth()).toBe(false);
  });

  it("discards the previous display's buffer on display switch", async () => {
    const { rpc, client } = makeSupabase();

    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");
    markKdsItemArrived("item-1", "order-1", "poll");
    expect(hasPendingKdsDeviceTruth()).toBe(true);

    setKdsDeviceTruthContext("display-2", "dev-2", "1.0.0");
    expect(hasPendingKdsDeviceTruth()).toBe(false);

    markKdsItemAcked("item-1", "order-1");
    await flushKdsDeviceTruth(client);
    expect(payloadOf(rpc).p_kds_display_id).toBe("display-2");
  });

  it("flushes a large backlog in bounded chunks instead of evicting the oldest events", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    for (let i = 0; i < 1200; i++) {
      markKdsItemArrived(`item-${i}`, "order-1", "reconnect");
    }
    expect(getPendingKdsDeviceTruthCount()).toBe(1200);

    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(payloadOf(rpc, 0).p_events).toHaveLength(MAX_EVENTS_PER_CALL);
    expect(payloadOf(rpc, 1).p_events).toHaveLength(MAX_EVENTS_PER_CALL);
    expect(payloadOf(rpc, 2).p_events).toHaveLength(200);
    // The FIRST item marked is the first sent — nothing was dropped.
    expect(payloadOf(rpc, 0).p_events[0].order_item_id).toBe("item-0");
    expect(hasPendingKdsDeviceTruth()).toBe(false);
  });

  it("caps the calls per flush tick and keeps the remainder pending", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    for (let i = 0; i < 2500; i++) {
      markKdsItemArrived(`item-${i}`, "order-1", "reconnect");
    }
    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(getPendingKdsDeviceTruthCount()).toBe(500);

    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(5);
    expect(hasPendingKdsDeviceTruth()).toBe(false);
  });

  it("stops on the first failed chunk so nothing after it is claimed as sent", async () => {
    const { rpc, client } = makeSupabase();
    setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");

    for (let i = 0; i < 700; i++) {
      markKdsItemArrived(`item-${i}`, "order-1", "poll");
    }
    (rpc as unknown as RpcMock)
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "offline" } });

    await flushKdsDeviceTruth(client);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(getPendingKdsDeviceTruthCount()).toBe(200);
  });

  describe("persistence across remount / restart", () => {
    it("does NOT re-emit items the display already reported after a remount", async () => {
      const { rpc, client } = makeSupabase();
      setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");
      markKdsItemArrived("item-1", "order-1", "broadcast");
      markKdsItemAcked("item-1", "order-1");
      await flushKdsDeviceTruth(client);
      expect(rpc).toHaveBeenCalledTimes(1);

      // Screen unmounts (module state cleared) and mounts again with the
      // persisted board: the arrival effect re-marks everything.
      resetKdsDeviceTruth();
      setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");
      markKdsItemArrived("item-1", "order-1", "rehydrate");
      markKdsItemAcked("item-1", "order-1");

      expect(hasPendingKdsDeviceTruth()).toBe(false);
      await flushKdsDeviceTruth(client);
      expect(rpc).toHaveBeenCalledTimes(1); // no second claim
    });

    it("replays an unflushed batch after a restart with its original client_event_at", async () => {
      const { rpc, client } = makeSupabase();
      setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");
      markKdsItemArrived("item-1", "order-1", "broadcast");
      // App dies before the heartbeat could flush.
      resetKdsDeviceTruth();

      setKdsDeviceTruthContext("display-1", "dev-1", "1.0.1");
      expect(getPendingKdsDeviceTruthCount()).toBe(1);
      // The remount also re-marks the item; it must not become a second event.
      markKdsItemArrived("item-1", "order-1", "rehydrate");
      expect(getPendingKdsDeviceTruthCount()).toBe(1);

      await flushKdsDeviceTruth(client);
      const event = payloadOf(rpc).p_events[0];
      expect(event.source).toBe("broadcast");
      expect(payloadOf(rpc).p_app_version).toBe("1.0.1");
    });

    it("claims a re-FIRED item again (new fire epoch) but not a re-rendered one", async () => {
      const { rpc, client } = makeSupabase();
      setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");
      markKdsItemArrived("item-1", "order-1", "broadcast", 1_000);
      markKdsItemArrived("item-1", "order-1", "poll", 1_000); // same routing event
      await flushKdsDeviceTruth(client);
      expect(payloadOf(rpc).p_events).toHaveLength(1);

      // Same item routed again with a later fire time = a new server-side
      // routing row (item, display, fired_at) = a new delivery to measure.
      markKdsItemArrived("item-1", "order-1", "broadcast", 2_000);
      await flushKdsDeviceTruth(client);
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(payloadOf(rpc, 1).p_events[0]).toMatchObject({
        order_item_id: "item-1",
        event_type: "arrived",
        source: "broadcast",
      });
    });

    it("keeps persisted state per display", async () => {
      const { rpc, client } = makeSupabase();
      setKdsDeviceTruthContext("display-1", "dev-1", "1.0.0");
      markKdsItemArrived("item-1", "order-1", "poll");
      await flushKdsDeviceTruth(client);

      setKdsDeviceTruthContext("display-2", "dev-1", "1.0.0");
      markKdsItemArrived("item-1", "order-1", "poll"); // new display, new claim
      await flushKdsDeviceTruth(client);
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(payloadOf(rpc, 1).p_kds_display_id).toBe("display-2");
    });
  });
});
