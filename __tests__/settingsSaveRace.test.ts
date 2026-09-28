/**
 * Settings changes must not flip back while they save.
 *
 * A settings edit is applied locally, then written to the server. A read that
 * started before the write landed returns the old value; applying it flipped
 * the control back, and the next read flipped it forward again. These tests
 * drive that race through the real stores for both settings paths: per-station
 * display settings (kds_displays) and location config (pos_config).
 */
// The KDS store transitively imports `uuid` (ESM, untransformed) — see
// kdsOrderScopedRefresh.test.ts for why it is stubbed rather than transformed.
jest.mock("uuid", () => ({
  v4: () => "00000000-0000-4000-8000-000000000000",
  v5: () => "00000000-0000-5000-8000-000000000000",
}));

import { createPendingWrites } from "@/lib/pendingWrites";
import { setKDSSupabaseClient, useKDSStore } from "@/stores/useKDSStore";
import {
  beginLocationConfigRead,
  useLocationConfigStore,
} from "@/stores/useLocationConfigStore";
import type { KDSDisplayConfig } from "@/types/kds";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createPendingWrites", () => {
  it("overlays an unconfirmed edit on any read", () => {
    const w = createPendingWrites();
    const read = w.beginRead();
    w.record("ns", "a", 1);
    expect(w.overlay("ns", read)).toEqual({ a: 1 });
    expect(w.overlay("ns", w.beginRead())).toEqual({ a: 1 });
  });

  it("keeps a confirmed edit over a read that started before the confirm", () => {
    const w = createPendingWrites();
    const id = w.record("ns", "a", 1);
    const staleRead = w.beginRead();
    w.confirm("ns", "a", id);
    expect(w.overlay("ns", staleRead)).toEqual({ a: 1 });
  });

  it("trusts, and forgets the edit for, a read that started after the confirm", () => {
    const w = createPendingWrites();
    const id = w.record("ns", "a", 1);
    w.confirm("ns", "a", id);
    expect(w.overlay("ns", w.beginRead())).toEqual({});
    // Forgotten: an older read no longer gets it either.
    expect(w.overlay("ns", 0)).toEqual({});
  });

  it("does not let an older write's outcome touch a newer edit", () => {
    const w = createPendingWrites();
    const first = w.record("ns", "a", 1);
    w.record("ns", "a", 2);
    w.confirm("ns", "a", first);
    expect(w.drop("ns", "a", first)).toBe(false);
    expect(w.overlay("ns", w.beginRead())).toEqual({ a: 2 });
  });
});

// ─── Per-station display settings (useKDSStore) ───────────────────

const DISPLAY_ID = "display-1";
const STATION_ID = "station-1";

function displayRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DISPLAY_ID,
    location_id: "loc-1",
    display_name: "Grill",
    routing_mode: "all",
    columns: 4,
    font_scale: 1,
    show_server_name: false,
    sound_on_new_order: false,
    sound_config: null,
    ...overrides,
  };
}

/**
 * kds_displays double: each display read and each update is a deferred the
 * test resolves, so their ordering can be staged. Routing rules and prep
 * stations resolve empty at once.
 */
function makeKdsClient() {
  const reads: ReturnType<typeof deferred<any>>[] = [];
  const updates: { row: any; result: ReturnType<typeof deferred<any>> }[] = [];
  const from = (table: string) => {
    let update: any = null;
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      abortSignal: () => chain,
      update: (row: any) => {
        update = row;
        return chain;
      },
      maybeSingle: () => {
        const d = deferred<any>();
        reads.push(d);
        return d.promise;
      },
      then: (res: any, rej: any) => {
        if (update) {
          const d = deferred<any>();
          updates.push({ row: update, result: d });
          return d.promise.then(res, rej);
        }
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      },
    };
    expect(["kds_displays", "kds_routing_rules", "prep_stations"]).toContain(
      table,
    );
    return chain;
  };
  return { client: { from } as any, reads, updates };
}

function seedDisplay(config: Partial<KDSDisplayConfig> = {}) {
  useKDSStore.setState({
    kdsDisplayId: DISPLAY_ID,
    kdsDisplayConfig: {
      displayName: "Grill",
      columns: 4,
      alertMinutes: null,
      warningMinutes: null,
      autoBumpMinutes: null,
      soundOnNewOrder: false,
      soundOnRush: null,
      soundConfig: null,
      showAllergyFlags: null,
      showOrderNotes: null,
      showServerName: false,
      fontScale: 1,
      showAllItems: null,
      ...config,
    },
  });
}

const displayConfig = () => useKDSStore.getState().kdsDisplayConfig!;

describe("updateKDSDisplay vs fetchKDSDisplay", () => {
  afterEach(() => setKDSSupabaseClient(null));

  it("applies the change at once and writes the mapped column", async () => {
    seedDisplay();
    const { client, updates } = makeKdsClient();
    setKDSSupabaseClient(client);

    const save = useKDSStore
      .getState()
      .updateKDSDisplay(DISPLAY_ID, { columns: 3, fontScale: 1.25 });
    expect(displayConfig().columns).toBe(3);
    expect(displayConfig().fontScale).toBe(1.25);

    await flush();
    expect(updates[0].row).toEqual({ columns: 3, font_scale: 1.25 });
    updates[0].result.resolve({ error: null });
    await expect(save).resolves.toBe(true);
  });

  it("a read already in flight does not flip the setting back, before or after the save lands", async () => {
    seedDisplay();
    const { client, reads, updates } = makeKdsClient();
    setKDSSupabaseClient(client);

    // Settings opened: a display read starts.
    const staleRead1 = useKDSStore.getState().fetchKDSDisplay(STATION_ID);
    const staleRead2 = useKDSStore.getState().fetchKDSDisplay(STATION_ID);
    await flush();

    const save = useKDSStore
      .getState()
      .updateKDSDisplay(DISPLAY_ID, { showServerName: true });
    await flush();

    // One stale read lands while the save is in flight…
    reads[0].resolve({ data: displayRow(), error: null });
    await staleRead1;
    expect(displayConfig().showServerName).toBe(true);

    // …the save lands…
    updates[0].result.resolve({ error: null });
    await save;

    // …and the other stale read lands after it.
    reads[1].resolve({ data: displayRow(), error: null });
    await staleRead2;
    expect(displayConfig().showServerName).toBe(true);

    // A read started after the save is authoritative again.
    const freshRead = useKDSStore.getState().fetchKDSDisplay(STATION_ID);
    await flush();
    reads[2].resolve({ data: displayRow({ show_server_name: true }), error: null });
    await freshRead;
    expect(displayConfig().showServerName).toBe(true);
  });

  it("reverts and reports failure when the write fails", async () => {
    seedDisplay({ fontScale: 1 });
    const { client, updates } = makeKdsClient();
    setKDSSupabaseClient(client);

    const save = useKDSStore
      .getState()
      .updateKDSDisplay(DISPLAY_ID, { fontScale: 1.5 });
    expect(displayConfig().fontScale).toBe(1.5);
    await flush();
    updates[0].result.resolve({ error: { message: "offline" } });

    await expect(save).resolves.toBe(false);
    expect(displayConfig().fontScale).toBe(1);
  });
});

// ─── Location config (useLocationConfigStore) ─────────────────────

describe("updateConfig vs config hydrate", () => {
  const LOCATION = "loc-1";

  function makeConfigClient() {
    const rpc = jest.fn(() => Promise.resolve({ error: null }));
    const channel = { subscribe: jest.fn(), send: jest.fn() };
    return {
      client: {
        rpc,
        channel: () => channel,
        removeChannel: jest.fn(),
      } as any,
      rpc,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    useLocationConfigStore
      .getState()
      .hydrateConfig(LOCATION, {}, null, beginLocationConfigRead());
  });
  afterEach(() => jest.useRealTimers());

  it("sends every field changed inside the debounce window", async () => {
    const { client, rpc } = makeConfigClient();
    useLocationConfigStore.getState()._setSupabase(client, null);

    const { updateConfig } = useLocationConfigStore.getState();
    updateConfig("kds", { hideDoneItems: true });
    updateConfig("kds", { alphabeticalSort: true });
    jest.advanceTimersByTime(500);
    await flush();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("update_location_pos_config", {
      p_location_id: LOCATION,
      p_namespace: "kds",
      p_config: { hideDoneItems: true, alphabeticalSort: true },
    });
  });

  it("a hydrate from a read that predates the save keeps the edit", async () => {
    const { client } = makeConfigClient();
    useLocationConfigStore.getState()._setSupabase(client, null);
    const kds = () => useLocationConfigStore.getState().config.kds;

    const staleRead = beginLocationConfigRead();
    useLocationConfigStore.getState().updateConfig("kds", { hideDoneItems: true });

    // Lands while the save is still debounced.
    useLocationConfigStore
      .getState()
      .hydrateConfig(LOCATION, { kds: { hideDoneItems: false } }, null, staleRead);
    expect(kds().hideDoneItems).toBe(true);

    jest.advanceTimersByTime(500);
    await flush();

    // Lands after the save.
    useLocationConfigStore
      .getState()
      .hydrateConfig(LOCATION, { kds: { hideDoneItems: false } }, null, staleRead);
    expect(kds().hideDoneItems).toBe(true);

    // A read after the save is authoritative (e.g. another station changed it).
    useLocationConfigStore
      .getState()
      .hydrateConfig(
        LOCATION,
        { kds: { hideDoneItems: false } },
        null,
        beginLocationConfigRead(),
      );
    expect(kds().hideDoneItems).toBe(false);
  });
});
