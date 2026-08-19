/**
 * AUD-2 acceptance evidence — versioned floor snapshot.
 *
 * Two acceptance criteria on the ticket were implemented but unproven, so they
 * could not be signed off:
 *
 *   - "Geometry payload not re-sent when version matches (network proof)"
 *   - "Realtime table-status reconciliation unchanged (cross-station seat/occupy)"
 *
 * The suppression tests drive the REAL FloorPlanService + the REAL
 * useFloorPlanStore against a fake supabase client, so every assertion about
 * "what went over the wire" is made at the actual RPC boundary (call count and
 * argument payload) rather than against a stubbed service. That is what makes
 * them a network proof rather than a restatement of the mock.
 *
 * The failure mode being guarded is asymmetric and worth stating plainly: a
 * missed suppression costs bytes, but a suppression the client cannot satisfy
 * from cache costs an EMPTY FLOOR PLAN on a live terminal — no tables, no
 * sessions, no way to take an order. The empty-cache test below exists for that
 * one case and must never be deleted as "unreachable".
 */

// uuid is pulled in transitively by the session store; the ESM build breaks
// under jest's CJS transform. Same shim the sibling session-store suites use.
jest.mock("uuid", () => {
  let mockUuidSeq = 0;
  return {
    v4: () => {
      mockUuidSeq += 1;
      return `00000000-0000-4000-8000-${String(mockUuidSeq).padStart(12, "0")}`;
    },
  };
});

jest.mock("@/stores/useReservationStore", () => ({
  useReservationStore: {
    getState: () => ({ nextReservationByTableId: {} }),
  },
}));

/* eslint-disable import/first -- jest.mock factories must be hoisted above these. */
import { __resetRpcFallbackMemo } from "@/lib/network/rpcVersionFallback";
import {
  isLocalOnlyStatus,
  resolveToSyncableStatus,
} from "@/lib/tableStateMachine";
import { FloorPlanService } from "@/services/floorPlanService";
import {
  setFloorPlanSupabaseClient,
  useFloorPlanStore,
} from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

// ---------------------------------------------------------------------------
// Fake supabase client — records every rpc()/from() so tests can assert on the
// wire traffic, not on a service stub.
// ---------------------------------------------------------------------------

type RpcResponse = { data: any; error: any };

const makeClient = () => {
  const rpcCalls: { name: string; params: any }[] = [];
  const fromCalls: string[] = [];
  const queues: Record<string, RpcResponse[]> = {};

  const rpc = jest.fn((name: string, params: any) => {
    rpcCalls.push({ name, params });
    const q = queues[name];
    if (!q || q.length === 0) {
      // Deliberately NOT a silent empty success: an unexpected round trip must
      // surface as a failing assertion somewhere, never as a benign default.
      return Promise.resolve({
        data: null,
        error: { code: "TEST_UNEXPECTED_RPC", message: `unqueued rpc: ${name}` },
      });
    }
    return Promise.resolve(q.length === 1 ? q[0] : q.shift()!);
  });

  const from = jest.fn((table: string) => {
    fromCalls.push(table);
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => Promise.resolve({ data: [], error: null }),
      order: () => Promise.resolve({ data: [], error: null }),
      then: (resolve: any) => resolve({ data: [], error: null }),
    };
    return chain;
  });

  return {
    client: { rpc, from } as any,
    rpcCalls,
    fromCalls,
    queue(name: string, ...responses: RpcResponse[]) {
      queues[name] = responses;
    },
    callsTo(name: string) {
      return rpcCalls.filter(c => c.name === name);
    },
  };
};

const plan = (id: string, name: string) => ({
  id,
  name,
  canvas_width: 1200,
  canvas_height: 800,
  grid_size: 20,
  background_color: "#fff",
  is_active: true,
});

const ok = (data: any): RpcResponse => ({ data, error: null });
const fail = (error: any): RpcResponse => ({ data: null, error });

beforeEach(() => {
  jest.clearAllMocks();
  // The absent-function memo is module-level and survives across tests; without
  // this reset a single PGRST202 case would route every later test down the
  // legacy path and they would pass for the wrong reason.
  __resetRpcFallbackMemo();
  useFloorPlanStore.setState({
    locationId: "loc-1",
    floorPlans: [],
    geometryVersion: null,
    activeFloorPlanId: null,
    tables: [],
    tablesById: {},
    error: null,
  } as any);
  useTableSessionStore.setState({
    sessions: {},
    sessionTableIndex: {},
  } as any);
});

afterEach(() => {
  setFloorPlanSupabaseClient(null);
});

// ===========================================================================
// 1. Geometry suppression at the RPC boundary (network proof)
// ===========================================================================

describe("AUD-2 · FloorPlanService.getFloorSnapshot geometry suppression", () => {
  it("returns geometry on a cold call and sends a null version token", async () => {
    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      ok({
        geometry_version: "v-abc",
        geometry: [plan("fp-1", "Main"), plan("fp-2", "Patio")],
        status: [{ table_id: "t1" }],
        sections: [],
      }),
    );

    const res = await FloorPlanService.getFloorSnapshot(h.client, "loc-1");

    expect(res.error).toBeNull();
    expect(res.usedFallback).toBe(false);
    expect(res.data!.geometry).toHaveLength(2);
    expect(res.data!.geometry_version).toBe("v-abc");
    // The server can only suppress if the client actually transmits the token
    // slot. A cold caller must send an explicit null, not omit the argument.
    expect(h.callsTo("get_floor_snapshot_v1")[0].params).toEqual({
      p_location_id: "loc-1",
      p_floor_plan_id: null,
      p_geometry_version: null,
    });
  });

  it("returns geometry === null when the caller's token matches", async () => {
    const h = makeClient();
    // Suppressed envelope: the server OMITS the geometry key entirely. Status
    // still rides along — that is the whole point of the one-round-trip design.
    h.queue(
      "get_floor_snapshot_v1",
      ok({
        geometry_version: "v-abc",
        status: [{ table_id: "t1", session_status: "seated" }],
        sections: [],
      }),
    );

    const res = await FloorPlanService.getFloorSnapshot(h.client, "loc-1", {
      knownVersion: "v-abc",
    });

    expect(res.data!.geometry).toBeNull();
    expect(res.data!.geometry_version).toBe("v-abc");
    expect(res.data!.status).toHaveLength(1);
    expect(h.callsTo("get_floor_snapshot_v1")[0].params.p_geometry_version).toBe(
      "v-abc",
    );
    // One round trip total. No follow-up geometry fetch of any kind.
    expect(h.rpcCalls).toHaveLength(1);
    expect(h.fromCalls).toEqual([]);
  });

  it("does NOT collapse a genuinely empty geometry array into 'unchanged'", async () => {
    // `[]` (a location with no floor plans) and "absent" (your token matches)
    // are different answers. Collapsing the former to null would make the store
    // reuse a stale cache forever after the last plan is deleted.
    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      ok({ geometry_version: "v-empty", geometry: [], status: [], sections: [] }),
    );

    const res = await FloorPlanService.getFloorSnapshot(h.client, "loc-1", {
      knownVersion: "v-old",
    });

    expect(res.data!.geometry).not.toBeNull();
    expect(res.data!.geometry).toEqual([]);
  });
});

// ===========================================================================
// 2. Warm path in the store — cached geometry survives a suppressed reply
// ===========================================================================

describe("AUD-2 · useFloorPlanStore.loadFloorPlans warm path", () => {
  it("keeps cached floorPlans (same identity) and refreshes only the token", async () => {
    const cached = [plan("fp-1", "Main"), plan("fp-2", "Patio")] as any[];
    useFloorPlanStore.setState({
      floorPlans: cached,
      geometryVersion: "v-1",
    } as any);

    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      ok({ geometry_version: "v-2", status: [], sections: [] }),
    );
    setFloorPlanSupabaseClient(h.client);

    await useFloorPlanStore.getState().loadFloorPlans();

    const after = useFloorPlanStore.getState();
    // Identity, not just deep-equality: a re-assignment would re-render every
    // DraggableTable even when nothing changed.
    expect(after.floorPlans).toBe(cached);
    expect(after.geometryVersion).toBe("v-2");
    expect(after.error).toBeNull();

    // Network proof: exactly one snapshot RPC, carrying the held token, and no
    // supplementary floor_plans table read to "patch" geometry back in.
    const calls = h.callsTo("get_floor_snapshot_v1");
    expect(calls).toHaveLength(1);
    expect(calls[0].params.p_geometry_version).toBe("v-1");
    expect(h.fromCalls).toEqual([]);
  });

  it("sends the held token on every subsequent load (suppression is sticky)", async () => {
    useFloorPlanStore.setState({
      floorPlans: [plan("fp-1", "Main")] as any[],
      geometryVersion: "v-1",
    } as any);

    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      ok({ geometry_version: "v-1", status: [], sections: [] }),
      ok({ geometry_version: "v-1", status: [], sections: [] }),
    );
    setFloorPlanSupabaseClient(h.client);

    await useFloorPlanStore.getState().loadFloorPlans();
    await useFloorPlanStore.getState().loadFloorPlans();

    const tokens = h
      .callsTo("get_floor_snapshot_v1")
      .map(c => c.params.p_geometry_version);
    expect(tokens).toEqual(["v-1", "v-1"]);
    expect(useFloorPlanStore.getState().floorPlans).toHaveLength(1);
  });

  it("applies fresh geometry when the token no longer matches", async () => {
    useFloorPlanStore.setState({
      floorPlans: [plan("fp-1", "Main")] as any[],
      geometryVersion: "v-1",
    } as any);

    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      ok({
        geometry_version: "v-2",
        geometry: [plan("fp-1", "Main"), plan("fp-9", "Rooftop")],
        status: [],
        sections: [],
      }),
    );
    jest
      .spyOn(FloorPlanService, "getAllFloorPlanObjects")
      .mockResolvedValue({ data: [], error: null });
    jest
      .spyOn(FloorPlanService, "getServerSections")
      .mockResolvedValue({ data: [], error: null });
    setFloorPlanSupabaseClient(h.client);

    await useFloorPlanStore.getState().loadFloorPlans();

    const after = useFloorPlanStore.getState();
    expect(after.floorPlans.map(p => p.id)).toEqual(["fp-1", "fp-9"]);
    expect(after.geometryVersion).toBe("v-2");
  });
});

// ===========================================================================
// 3. THE CRITICAL EDGE — token held, cache empty. Never leave the floor empty.
// ===========================================================================

describe("AUD-2 · suppressed reply with an EMPTY floorPlans cache", () => {
  it("re-requests WITHOUT the token and paints the geometry it gets back", async () => {
    // Token survived (MMKV rehydrate, partial state wipe, cache eviction) but
    // the geometry it describes did not. Honouring the suppression here is the
    // difference between a stale-token bug and a blank floor on a live POS.
    useFloorPlanStore.setState({
      floorPlans: [],
      geometryVersion: "v-orphan",
    } as any);

    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      // 1st: server says "your token is current" — but we have nothing to reuse.
      ok({ geometry_version: "v-orphan", status: [], sections: [] }),
      // 2nd: the guard must ask again with no token, which forces a full send.
      ok({
        geometry_version: "v-orphan",
        geometry: [plan("fp-1", "Main"), plan("fp-2", "Patio")],
        status: [],
        sections: [],
      }),
    );
    jest
      .spyOn(FloorPlanService, "getAllFloorPlanObjects")
      .mockResolvedValue({ data: [], error: null });
    jest
      .spyOn(FloorPlanService, "getServerSections")
      .mockResolvedValue({ data: [], error: null });
    setFloorPlanSupabaseClient(h.client);

    await useFloorPlanStore.getState().loadFloorPlans();

    const calls = h.callsTo("get_floor_snapshot_v1");
    // The guard fired: a SECOND request went out, and it dropped the token.
    expect(calls).toHaveLength(2);
    expect(calls[0].params.p_geometry_version).toBe("v-orphan");
    expect(calls[1].params.p_geometry_version).toBeNull();

    // And the floor is populated. If the early-return guard is ever removed,
    // this is the assertion that goes red.
    const after = useFloorPlanStore.getState();
    expect(after.floorPlans).toHaveLength(2);
    expect(after.floorPlans.map(p => p.id)).toEqual(["fp-1", "fp-2"]);
  });

  it("does not early-return on the warm path when the cache is empty", async () => {
    // Guards against the specific regression of reordering the two branches:
    // `set(version); return;` before the length check would leave floorPlans []
    // AND bank the token, so every later load would also be suppressed —
    // a permanently blank floor that no retry can heal.
    useFloorPlanStore.setState({
      floorPlans: [],
      geometryVersion: "v-orphan",
    } as any);

    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      ok({ geometry_version: "v-orphan", status: [], sections: [] }),
      ok({
        geometry_version: "v-fresh",
        geometry: [plan("fp-1", "Main")],
        status: [],
        sections: [],
      }),
    );
    jest
      .spyOn(FloorPlanService, "getAllFloorPlanObjects")
      .mockResolvedValue({ data: [], error: null });
    jest
      .spyOn(FloorPlanService, "getServerSections")
      .mockResolvedValue({ data: [], error: null });
    setFloorPlanSupabaseClient(h.client);

    await useFloorPlanStore.getState().loadFloorPlans();

    expect(useFloorPlanStore.getState().floorPlans).not.toHaveLength(0);
    expect(useFloorPlanStore.getState().geometryVersion).toBe("v-fresh");
  });

  it("surfaces the retry error without pretending the floor is empty", async () => {
    useFloorPlanStore.setState({
      floorPlans: [],
      geometryVersion: "v-orphan",
    } as any);

    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      ok({ geometry_version: "v-orphan", status: [], sections: [] }),
      fail({ code: "57014", message: "canceling statement due to timeout" }),
    );
    setFloorPlanSupabaseClient(h.client);

    await useFloorPlanStore.getState().loadFloorPlans();

    // Errors must NOT be laundered into `floorPlans: []` — an operator seeing
    // an error banner can retry; an operator seeing a blank floor cannot.
    expect(useFloorPlanStore.getState().error).toMatch(/timeout/i);
    expect(useFloorPlanStore.getState().geometryVersion).toBe("v-orphan");
  });
});

// ===========================================================================
// 3b. What KEEPS the edge above unreachable: the token and the geometry it
//     describes are persisted together, or not at all.
// ===========================================================================

describe("AUD-2 · persisted token and persisted geometry stay coupled", () => {
  const partialize = () =>
    (useFloorPlanStore as any).persist.getOptions().partialize as (
      s: any,
    ) => Record<string, unknown>;

  it("persists geometryVersion if and only if it persists floorPlans", () => {
    // This store has a documented history of DROPPING persisted fields to cut
    // write amplification (floorPlanCache, embedded sessions). Dropping
    // floorPlans while keeping geometryVersion would be an easy, well-intentioned
    // follow-up — and it would turn the "should be unreachable" empty-cache
    // branch into the behaviour of EVERY cold start: a banked token with no
    // geometry behind it. Pin the pairing so that change cannot land quietly.
    const persisted = partialize()(useFloorPlanStore.getState());
    const keeps = (k: string) =>
      Object.prototype.hasOwnProperty.call(persisted, k);

    // Assert both are actually present, not merely that they agree — a bare
    // `keeps(a) === keeps(b)` is satisfied just as well by dropping BOTH, which
    // is the very regression this test exists to catch.
    expect(keeps("floorPlans")).toBe(true);
    expect(keeps("geometryVersion")).toBe(true);
    expect(keeps("geometryVersion")).toBe(keeps("floorPlans"));
  });

  it("round-trips both halves of the snapshot with their real values", () => {
    useFloorPlanStore.setState({
      floorPlans: [plan("fp-1", "Main"), plan("fp-2", "Patio")] as any[],
      geometryVersion: "v-7",
    } as any);

    const persisted: any = partialize()(useFloorPlanStore.getState());

    expect(persisted.geometryVersion).toBe("v-7");
    expect(persisted.floorPlans.map((p: any) => p.id)).toEqual([
      "fp-1",
      "fp-2",
    ]);
  });
});

// ===========================================================================
// 4. Legacy fallback — environments without get_floor_snapshot_v1
// ===========================================================================

describe("AUD-2 · get_floor_snapshot_v1 absent (PGRST202) legacy fallback", () => {
  it("falls back to get_location_floor_plans and reports a null version", async () => {
    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      fail({
        code: "PGRST202",
        message: "Could not find the function public.get_floor_snapshot_v1",
      }),
    );
    h.queue(
      "get_location_floor_plans",
      ok([plan("fp-1", "Main"), plan("fp-2", "Patio")]),
    );

    const res = await FloorPlanService.getFloorSnapshot(h.client, "loc-1", {
      knownVersion: "v-abc",
    });

    expect(res.usedFallback).toBe(true);
    expect(res.error).toBeNull();
    expect(res.data!.geometry).toHaveLength(2);
    // A null version is what keeps the caller off the suppression path: it can
    // never bank a token the legacy RPC has no way to honour.
    expect(res.data!.geometry_version).toBeNull();
    expect(res.data!.status).toBeNull();
  });

  it("also falls back on a Postgres 42883 undefined_function", async () => {
    // PGRST202 is raised by PostgREST from its schema cache; 42883 is what
    // Postgres itself raises when the cache is warm but the function is gone
    // (mid-migration, or a prod box that hasn't received the promote yet).
    // Both mean "not deployed here" and both must reach the legacy path.
    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      fail({
        code: "42883",
        message:
          "function public.get_floor_snapshot_v1(uuid, uuid, text) does not exist",
      }),
    );
    h.queue("get_location_floor_plans", ok([plan("fp-1", "Main")]));

    const res = await FloorPlanService.getFloorSnapshot(h.client, "loc-1", {
      knownVersion: "v-abc",
    });

    expect(res.usedFallback).toBe(true);
    expect(res.error).toBeNull();
    expect(res.data!.geometry).toHaveLength(1);
    expect(res.data!.geometry_version).toBeNull();
  });

  it("memoises the absence so later calls skip the doomed probe", async () => {
    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      fail({ code: "PGRST202", message: "not found" }),
    );
    h.queue("get_location_floor_plans", ok([plan("fp-1", "Main")]));

    await FloorPlanService.getFloorSnapshot(h.client, "loc-1");
    await FloorPlanService.getFloorSnapshot(h.client, "loc-1");
    await FloorPlanService.getFloorSnapshot(h.client, "loc-1");

    // Without the memo this is a wasted round trip on every poll, forever.
    expect(h.callsTo("get_floor_snapshot_v1")).toHaveLength(1);
    expect(h.callsTo("get_location_floor_plans")).toHaveLength(3);
  });

  it("does NOT fall back on a real error (permission denied propagates)", async () => {
    // Masking a 42501/57014 behind the legacy RPC would hide the actual fault
    // and double the latency of every failure.
    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      fail({ code: "42501", message: "permission denied for function" }),
    );

    const res = await FloorPlanService.getFloorSnapshot(h.client, "loc-1");

    expect(res.usedFallback).toBe(false);
    expect(res.error).toMatchObject({ code: "42501" });
    expect(res.data).toBeNull();
    expect(h.callsTo("get_location_floor_plans")).toHaveLength(0);
  });

  it("the store populates the floor AND clears a held token on the legacy path", async () => {
    // Seed a NON-null token. Asserting `geometryVersion === null` from a
    // already-null start passes even if the store never touches the field, so
    // it would prove nothing (verified by mutation: deleting the store's
    // token-write left that assertion green). Starting from "v-stale" makes the
    // clear observable.
    //
    // Why the clear matters: this device just failed over to an environment
    // without get_floor_snapshot_v1, and the absence is memoised for the rest
    // of the session. Keeping a token the legacy RPC can never honour is how a
    // device ends up suppressing geometry it has no way to re-request.
    useFloorPlanStore.setState({
      floorPlans: [],
      geometryVersion: "v-stale",
    } as any);

    const h = makeClient();
    h.queue(
      "get_floor_snapshot_v1",
      fail({ code: "PGRST202", message: "not found" }),
    );
    h.queue("get_location_floor_plans", ok([plan("fp-1", "Main")]));
    jest
      .spyOn(FloorPlanService, "getAllFloorPlanObjects")
      .mockResolvedValue({ data: [], error: null });
    jest
      .spyOn(FloorPlanService, "getServerSections")
      .mockResolvedValue({ data: [], error: null });
    setFloorPlanSupabaseClient(h.client);

    await useFloorPlanStore.getState().loadFloorPlans();

    expect(useFloorPlanStore.getState().floorPlans).toHaveLength(1);
    expect(useFloorPlanStore.getState().geometryVersion).toBeNull();
  });
});

// ===========================================================================
// 5. Cross-station table-status reconciliation is UNCHANGED by the snapshot
// ===========================================================================

const LOCAL_ONLY = ["seating", "ordering", "paying", "closing"] as const;

const sess = (id: string, tableId: string, status: string) =>
  ({
    id,
    table_id: tableId,
    status,
    party_size: 2,
    order_id: null,
    is_active: true,
  }) as any;

const tableWith = (tableId: string, session: any) =>
  ({ id: tableId, session }) as any;

const statusRow = (tableId: string, sessionId: string, status: string) =>
  ({
    table_id: tableId,
    table_name: tableId,
    session_id: sessionId,
    session_status: status,
    party_size: 2,
    seated_at: "2026-08-14T00:00:00.000Z",
    current_course: 1,
  }) as any;

const setLocal = (tableId: string, session: any) =>
  useTableSessionStore
    .getState()
    .batchDispatch([{ tableId, action: { type: "SET", session } }] as any);

const statusOf = (tableId: string) =>
  useTableSessionStore.getState().sessions[tableId]?.status;

describe("AUD-2 · local-only statuses survive a snapshot refresh", () => {
  it("keeps the local-only set exactly as the four in-flight sub-states", () => {
    // These four are deliberately invisible to the backend. If one is ever
    // added to (or removed from) the set, every preservation guard below
    // silently changes meaning — pin it here.
    LOCAL_ONLY.forEach(s => expect(isLocalOnlyStatus(s as any)).toBe(true));
    ["available", "seated", "ordered", "served", "check_presented", "paid", "cleaning"]
      .forEach(s => expect(isLocalOnlyStatus(s as any)).toBe(false));

    expect(resolveToSyncableStatus("seating" as any)).toBe("available");
    expect(resolveToSyncableStatus("ordering" as any)).toBe("seated");
    expect(resolveToSyncableStatus("paying" as any)).toBe("check_presented");
    expect(resolveToSyncableStatus("closing" as any)).toBe("cleaning");
    // Already-syncable statuses pass through untouched.
    expect(resolveToSyncableStatus("served" as any)).toBe("served");
  });

  it.each(LOCAL_ONLY)(
    "a plan snapshot does not downgrade a live '%s' on the same session",
    localStatus => {
      setLocal("t1", sess("s-1", "t1", localStatus));

      // Station B's write lands in the shared backend; our next authoritative
      // snapshot reports the backend status for the SAME session.
      useTableSessionStore
        .getState()
        ._patchSessionsFromTables([tableWith("t1", sess("s-1", "t1", "seated"))], {
          clearMissing: true,
        });

      expect(statusOf("t1")).toBe(localStatus);
      expect(useTableSessionStore.getState().sessions["t1"]?.id).toBe("s-1");
    },
  );

  it.each(LOCAL_ONLY)(
    "the backend poll does not downgrade a live '%s' on the same session",
    async localStatus => {
      setLocal("t1", sess("s-1", "t1", localStatus));

      const h = makeClient();
      jest
        .spyOn(FloorPlanService, "getLocationTableStatus")
        .mockResolvedValue({
          data: [statusRow("t1", "s-1", "seated")],
          error: null,
        });
      setFloorPlanSupabaseClient(h.client);

      await useTableSessionStore.getState().hydrateFromBackend("loc-1");

      expect(statusOf("t1")).toBe(localStatus);
    },
  );

  it("a cross-station TURNOVER (new session id) still replaces the local state", async () => {
    // The preservation guard must be same-session-id only. If it were not,
    // a table this station left in 'paying' could never be re-seated by
    // another station — the table would be permanently wedged.
    setLocal("t1", sess("s-1", "t1", "paying"));

    useTableSessionStore
      .getState()
      ._patchSessionsFromTables([tableWith("t1", sess("s-2", "t1", "seated"))], {
        clearMissing: true,
      });

    expect(useTableSessionStore.getState().sessions["t1"]?.id).toBe("s-2");
    expect(statusOf("t1")).toBe("seated");
  });

  it("a cross-station SEAT on a table we thought was free becomes visible", async () => {
    expect(useTableSessionStore.getState().sessions["t2"]).toBeUndefined();

    useTableSessionStore
      .getState()
      ._patchSessionsFromTables([tableWith("t2", sess("s-9", "t2", "seated"))], {
        clearMissing: true,
      });

    expect(useTableSessionStore.getState().sessions["t2"]?.id).toBe("s-9");
    expect(statusOf("t2")).toBe("seated");
  });

  it("a cross-station CLEAR frees a backend-status table but not a local-only one", () => {
    setLocal("t1", sess("s-1", "t1", "seated")); // backend-visible
    setLocal("t2", sess("s-2", "t2", "ordering")); // local-only, mid-entry here

    // Authoritative snapshot: both tables present, neither carries a session.
    useTableSessionStore
      .getState()
      ._patchSessionsFromTables(
        [tableWith("t1", null), tableWith("t2", null)],
        { clearMissing: true },
      );

    expect(useTableSessionStore.getState().sessions["t1"]).toBeUndefined();
    expect(statusOf("t2")).toBe("ordering");
  });

  it("a non-authoritative (cached) snapshot never clears anything", () => {
    setLocal("t1", sess("s-1", "t1", "seated"));

    // No clearMissing: cache-paint / mount callers are add-only. Running the
    // sweep against a session-stripped cached snapshot would blank the floor
    // on cold start.
    useTableSessionStore
      .getState()
      ._patchSessionsFromTables([tableWith("t1", null)]);

    expect(useTableSessionStore.getState().sessions["t1"]?.id).toBe("s-1");
  });

  it("a normal backend transition still SYNCs (guard is not a blanket freeze)", () => {
    // Positive case: without this, a guard that "preserves everything" would
    // pass every negative test above while breaking real reconciliation.
    setLocal("t1", sess("s-1", "t1", "seated"));

    useTableSessionStore
      .getState()
      ._patchSessionsFromTables([tableWith("t1", sess("s-1", "t1", "ordered"))], {
        clearMissing: true,
      });

    expect(statusOf("t1")).toBe("ordered");
  });

  it("a plan-scoped snapshot leaves other plans' tables alone", () => {
    setLocal("t1", sess("s-1", "t1", "seated")); // plan A
    setLocal("t99", sess("s-99", "t99", "served")); // plan B, not in this snapshot

    useTableSessionStore
      .getState()
      ._patchSessionsFromTables([tableWith("t1", sess("s-1", "t1", "served"))], {
        clearMissing: true,
      });

    expect(statusOf("t1")).toBe("served");
    expect(useTableSessionStore.getState().sessions["t99"]?.id).toBe("s-99");
  });
});
