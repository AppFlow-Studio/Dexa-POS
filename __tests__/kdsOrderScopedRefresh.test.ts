/**
 * Order-scoped KDS refresh (AUD-8 step 2).
 *
 * A header-only broadcast names the order that changed, so the board is patched
 * from get_kds_tickets_for_order_v1 instead of refetching the whole location.
 *
 * The risk this guards is the splice: _fetchTicketsForOrder writes `tickets`,
 * `_ticketsById` and the status buckets — i.e. the whole board — while only
 * being authoritative for ONE order. Every test here is about what must NOT
 * change for the other orders on the board.
 *
 * Unlike the other KDS suites this loads the real store rather than
 * source-asserting, because reference identity and removal semantics are the
 * whole point and a regex cannot see them.
 */
// The store transitively imports `uuid` (via lib/network/idempotencyKey), which
// ships ESM that this project's transformIgnorePatterns does not transform —
// the reason the other KDS suites source-assert instead of loading the store.
// Stubbing it here keeps the module graph loadable without widening the global
// jest transform for every suite. No path under test generates a key.
jest.mock("uuid", () => ({
  v4: () => "00000000-0000-4000-8000-000000000000",
  v5: () => "00000000-0000-5000-8000-000000000000",
}));

import { __resetRpcFallbackMemo } from "@/lib/network/rpcVersionFallback";
import { setKDSSupabaseClient, useKDSStore } from "@/stores/useKDSStore";
import type { KDSTicket } from "@/types/kds";

const LOCATION = "11111111-1111-1111-1111-111111111111";
const ORDER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mkTicket(
  orderId: string,
  suffix: string,
  overrides: Partial<KDSTicket> = {},
): KDSTicket {
  return {
    ticket_id: `${orderId}_c1_f${suffix}`,
    order_id: orderId,
    db_order_id: orderId,
    order_number: `#${suffix}`,
    display_number: suffix,
    course_number: 1,
    status: "cooking",
    order_type: "dine_in",
    table_name: null,
    customer_name: null,
    start_time: "2026-08-14T12:00:00+00:00",
    start_time_epoch: Date.parse("2026-08-14T12:00:00+00:00"),
    item_count: 1,
    items: [
      {
        id: `${orderId}-item-1`,
        name: "Burger",
        quantity: 1,
        kitchen_status: "preparing",
        special_instructions: null,
        modifiers: [],
      },
    ],
    ...overrides,
  };
}

/** Supabase client double: client.rpc(name, params).abortSignal(signal) */
function makeClient(
  impl: (name: string, params: any) => { data: any; error: any },
) {
  const rpc = jest.fn((name: string, params: any) => ({
    abortSignal: () => Promise.resolve(impl(name, params)),
  }));
  return { client: { rpc } as any, rpc };
}

/**
 * Observable state of a ticket — what the board renders from.
 *
 * NOT reference identity: mergeTickets re-normalizes the previous ticket on every
 * pass (`prev = normalizeKdsTicket(prevRaw)`, useKDSStore.ts:1257) and stores that
 * fresh object even on the unchanged branch, so no caller — this one or the
 * pre-existing whole-board fetch — ever preserves a stored ticket reference.
 * Asserting identity here would assert a property the store does not have.
 */
function summarize(ticket: KDSTicket | undefined) {
  if (!ticket) return null;
  return {
    ticket_id: ticket.ticket_id,
    db_order_id: ticket.db_order_id,
    status: ticket.status,
    order_number: ticket.order_number,
    items: ticket.items.map((i) => [i.id, i.kitchen_status]),
  };
}

/** Seed a two-order board as if a full fetch had already hydrated it. */
function seedBoard() {
  const a = mkTicket(ORDER_A, "1000");
  const b = mkTicket(ORDER_B, "2000");
  const byId = { [a.ticket_id]: a, [b.ticket_id]: b };
  useKDSStore.setState({
    tickets: [a, b],
    _ticketsById: byId,
    _ticketIdsByOrderId: {
      [ORDER_A]: new Set([a.ticket_id]),
      [ORDER_B]: new Set([b.ticket_id]),
    },
    ticketsByStatus: { pending: [], cooking: [a, b], ready: [] },
    counts: { pending: 0, cooking: 2, ready: 0 },
    doneTickets: [],
    doneCount: 0,
    prioritizedTicketIds: new Set<string>(),
    _hasHydrated: true,
    kdsDisplayId: null,
    _onNewOrderCallback: null,
  });
  return { a, b };
}

describe("_fetchTicketsForOrder — order-scoped board patch", () => {
  beforeEach(() => {
    __resetRpcFallbackMemo();
    useKDSStore.getState()._cleanup();
    setKDSSupabaseClient(null);
  });

  it("calls the order-scoped RPC with the location tenant guard", async () => {
    seedBoard();
    const { client, rpc } = makeClient(() => ({ data: [], error: null }));
    setKDSSupabaseClient(client);

    await useKDSStore.getState()._fetchTicketsForOrder(LOCATION, ORDER_A);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, params] = rpc.mock.calls[0];
    expect(name).toBe("get_kds_tickets_for_order_v1");
    // p_location_id is the tenant guard on a SECURITY DEFINER function — it must
    // never be dropped just because p_order_id already identifies the row.
    expect(params).toEqual({
      p_location_id: LOCATION,
      p_order_id: ORDER_A,
    });
  });

  it("patches the named order and leaves other orders untouched", async () => {
    const { a, b } = seedBoard();
    const bBefore = summarize(b);
    const { client } = makeClient(() => ({
      data: [
        mkTicket(ORDER_A, "1000", {
          status: "ready",
          items: [
            {
              id: `${ORDER_A}-item-1`,
              name: "Burger",
              quantity: 1,
              kitchen_status: "ready",
              special_instructions: null,
              modifiers: [],
              rush: true,
            },
          ],
        }),
      ],
      error: null,
    }));
    setKDSSupabaseClient(client);

    await useKDSStore.getState()._fetchTicketsForOrder(LOCATION, ORDER_A);

    const state = useKDSStore.getState();
    const nextA = state._ticketsById[a.ticket_id];
    expect(nextA.status).toBe("ready");
    expect(nextA.any_rush).toBe(true);
    // The splice writes the whole board, so the other order has to come through
    // it completely unchanged — same bucket, same items, same statuses.
    expect(summarize(state._ticketsById[b.ticket_id])).toEqual(bBefore);
    expect(state.tickets).toHaveLength(2);
    expect(state._ticketIdsByOrderId[ORDER_B]).toEqual(new Set([b.ticket_id]));
    expect(state.ticketsByStatus.cooking.map((t) => t.ticket_id)).toEqual([
      b.ticket_id,
    ]);
    expect(state.ticketsByStatus.ready.map((t) => t.ticket_id)).toEqual([
      a.ticket_id,
    ]);
  });

  it("removes the order's tickets when the server returns none, keeping others", async () => {
    const { a, b } = seedBoard();
    const bBefore = summarize(b);
    const { client } = makeClient(() => ({ data: [], error: null }));
    setKDSSupabaseClient(client);

    await useKDSStore.getState()._fetchTicketsForOrder(LOCATION, ORDER_A);

    const state = useKDSStore.getState();
    expect(state._ticketsById[a.ticket_id]).toBeUndefined();
    expect(summarize(state._ticketsById[b.ticket_id])).toEqual(bBefore);
    expect(state.tickets.map((t) => t.ticket_id)).toEqual([b.ticket_id]);
    expect(state._ticketIdsByOrderId[ORDER_A]).toBeUndefined();
  });

  it("falls back to the whole-board refresh when the RPC is not deployed", async () => {
    seedBoard();
    const scheduleRefetch = jest.fn();
    useKDSStore.setState({ scheduleRefetch });
    const { client } = makeClient(() => ({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    }));
    setKDSSupabaseClient(client);

    await useKDSStore.getState()._fetchTicketsForOrder(LOCATION, ORDER_A);

    expect(scheduleRefetch).toHaveBeenCalledWith(LOCATION, true);
    // Missing-function must not be mistaken for "this order has no tickets".
    expect(useKDSStore.getState().tickets).toHaveLength(2);
  });

  it("falls back to the whole-board refresh on a real error, board untouched", async () => {
    const { a, b } = seedBoard();
    const scheduleRefetch = jest.fn();
    useKDSStore.setState({ scheduleRefetch });
    const { client } = makeClient(() => ({
      data: null,
      error: { code: "57014", message: "canceling statement" },
    }));
    setKDSSupabaseClient(client);

    await useKDSStore.getState()._fetchTicketsForOrder(LOCATION, ORDER_A);

    expect(scheduleRefetch).toHaveBeenCalledWith(LOCATION);
    const state = useKDSStore.getState();
    expect(state._ticketsById[a.ticket_id]).toBe(a);
    expect(state._ticketsById[b.ticket_id]).toBe(b);
  });

  it("defers to the whole-board read before the board has hydrated", async () => {
    seedBoard();
    useKDSStore.setState({ _hasHydrated: false });
    const scheduleRefetch = jest.fn();
    useKDSStore.setState({ scheduleRefetch });
    const { client, rpc } = makeClient(() => ({ data: [], error: null }));
    setKDSSupabaseClient(client);

    await useKDSStore.getState()._fetchTicketsForOrder(LOCATION, ORDER_A);

    // Nothing to splice into — patching would build a board from one order.
    expect(rpc).not.toHaveBeenCalled();
    expect(scheduleRefetch).toHaveBeenCalledWith(LOCATION, true);
  });

  it("passes the display id so routing-scoped stations stay scoped", async () => {
    seedBoard();
    const displayId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    useKDSStore.setState({ kdsDisplayId: displayId });
    const { client, rpc } = makeClient(() => ({ data: [], error: null }));
    setKDSSupabaseClient(client);

    await useKDSStore.getState()._fetchTicketsForOrder(LOCATION, ORDER_A);

    expect(rpc.mock.calls[0][1]).toEqual({
      p_location_id: LOCATION,
      p_order_id: ORDER_A,
      p_kds_display_id: displayId,
    });
  });
});

describe("_scheduleOrderRefetch — per-order debounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetRpcFallbackMemo();
    useKDSStore.getState()._cleanup();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("coalesces repeat events for one order into a single fetch", () => {
    const _fetchTicketsForOrder = jest.fn();
    useKDSStore.setState({ _fetchTicketsForOrder });

    const { _scheduleOrderRefetch } = useKDSStore.getState();
    _scheduleOrderRefetch(LOCATION, ORDER_A, true);
    _scheduleOrderRefetch(LOCATION, ORDER_A, true);
    _scheduleOrderRefetch(LOCATION, ORDER_A, true);
    jest.advanceTimersByTime(300);

    expect(_fetchTicketsForOrder).toHaveBeenCalledTimes(1);
    expect(_fetchTicketsForOrder).toHaveBeenCalledWith(LOCATION, ORDER_A);
  });

  it("does not let one busy order delay another order's refresh", () => {
    const _fetchTicketsForOrder = jest.fn();
    useKDSStore.setState({ _fetchTicketsForOrder });

    const { _scheduleOrderRefetch } = useKDSStore.getState();
    // The shared trailing timer this replaces would have re-armed here and
    // starved both orders under a sustained event stream.
    _scheduleOrderRefetch(LOCATION, ORDER_A, true);
    _scheduleOrderRefetch(LOCATION, ORDER_B, true);
    _scheduleOrderRefetch(LOCATION, ORDER_A, true);
    jest.advanceTimersByTime(300);

    expect(_fetchTicketsForOrder).toHaveBeenCalledTimes(2);
    expect(_fetchTicketsForOrder).toHaveBeenCalledWith(LOCATION, ORDER_A);
    expect(_fetchTicketsForOrder).toHaveBeenCalledWith(LOCATION, ORDER_B);
  });
});
