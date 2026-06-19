/**
 * Correctness: _patchSessionsFromTables (and hydrateFromBackend) must NEVER
 * downgrade a live, SAME-SESSION local-only status (seating/ordering/paying/
 * closing) when a plan snapshot carries a backend status for that same session.
 *
 * Bug: the SYNC branch of _applyAction deliberately does not preserve local-only
 * statuses. The CLEAR branch of _patchSessionsFromTables already guards local-only
 * (table missing from snapshot), but the SYNC branch (table present with a
 * DIFFERENT status) had no equivalent guard — so switching floor plans (cache-hit
 * paint with a prefetch-poisoned cache, or cache-miss reload) overwrote a live
 * 'ordering'/'paying' table back to the backend 'seated'/'available' value.
 *
 * Truth table under test:
 *  1. same-id local-only + snapshot backend status  -> PRESERVED (the fix)
 *  2. DIFFERENT-id session on a local-only table     -> REPLACES (turnover not blocked)
 *  3. non-local-only same-id (seated -> ordered)     -> still SYNCs normally
 */
jest.mock("uuid", () => {
  let mockUuidSeq = 0;
  return {
    v4: () => {
      mockUuidSeq += 1;
      return `00000000-0000-4000-8000-${String(mockUuidSeq).padStart(12, "0")}`;
    },
  };
});

import { useTableSessionStore } from "@/stores/useTableSessionStore";

const session = (id: string, tableId: string, status: string) =>
  ({
    id,
    table_id: tableId,
    status,
    party_size: 2,
    order_id: null,
    is_active: true,
  }) as any;

const tableWith = (tableId: string, s: any) =>
  ({ id: tableId, session: s }) as any;

const LOCAL_ONLY = ["seating", "ordering", "paying", "closing"] as const;

describe("_patchSessionsFromTables preserves live local-only statuses (SYNC branch)", () => {
  beforeEach(() => {
    useTableSessionStore.setState({ sessions: {}, sessionTableIndex: {} } as any);
  });

  it.each(LOCAL_ONLY)(
    "preserves a same-session '%s' status against a backend SYNC",
    (localStatus) => {
      const store = useTableSessionStore.getState();
      store.batchDispatch([
        {
          tableId: "t1",
          action: { type: "SET", session: session("s-1", "t1", localStatus) },
        },
      ] as any);

      // Snapshot for the same plan returns the SAME session id but the backend
      // status (the backend never knows about the local-only sub-state).
      store._patchSessionsFromTables([
        tableWith("t1", session("s-1", "t1", "seated")),
      ]);

      expect(useTableSessionStore.getState().sessions["t1"]?.status).toBe(
        localStatus,
      );
      expect(useTableSessionStore.getState().sessions["t1"]?.id).toBe("s-1");
    },
  );

  it("still REPLACES when the snapshot reports a DIFFERENT session id (turnover)", () => {
    const store = useTableSessionStore.getState();
    store.batchDispatch([
      {
        tableId: "t1",
        action: { type: "SET", session: session("s-1", "t1", "ordering") },
      },
    ] as any);

    // A genuinely new session took the table (different id) — must apply.
    store._patchSessionsFromTables([
      tableWith("t1", session("s-2", "t1", "seated")),
    ]);

    expect(useTableSessionStore.getState().sessions["t1"]?.id).toBe("s-2");
    expect(useTableSessionStore.getState().sessions["t1"]?.status).toBe(
      "seated",
    );
  });

  it("still SYNCs a non-local-only same-id status change (seated -> ordered)", () => {
    const store = useTableSessionStore.getState();
    store.batchDispatch([
      {
        tableId: "t2",
        action: { type: "SET", session: session("s-9", "t2", "seated") },
      },
    ] as any);

    store._patchSessionsFromTables([
      tableWith("t2", session("s-9", "t2", "ordered")),
    ]);

    expect(useTableSessionStore.getState().sessions["t2"]?.status).toBe(
      "ordered",
    );
  });
});
