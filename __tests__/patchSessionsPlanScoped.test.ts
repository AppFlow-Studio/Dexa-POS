/**
 * Regression: _patchSessionsFromTables must be PLAN-SCOPED.
 *
 * Floor snapshots cover ONE plan's tables. The old clear-sweep treated the
 * snapshot as authority over ALL sessions, so switching plans cleared every
 * other plan's sessions — and each CLEAR poisoned the recently-cleared TTL
 * map, making fetchFloorPlanSnapshot strip those sessions from fresh
 * snapshots for 30s ("all tables show available after switching plans").
 *
 * Contract under test:
 *  - sessions for tables NOT in the snapshot are PRESERVED
 *  - tables IN the snapshot with a session are SYNCed
 *  - tables IN the snapshot without a session are CLEARED
 *  - local-only statuses are never cleared
 */
// uuid ships ESM and isn't in transformIgnorePatterns — stub it.
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

describe("_patchSessionsFromTables plan scoping", () => {
  beforeEach(() => {
    useTableSessionStore.setState({ sessions: {} } as any);
    const store = useTableSessionStore.getState();
    // Seed: plan A table (occupied), plan B tables (one occupied, one local-only)
    store.batchDispatch([
      {
        tableId: "planA-t1",
        action: { type: "SET", session: session("s-a1", "planA-t1", "seated") },
      },
      {
        tableId: "planB-t1",
        action: { type: "SET", session: session("s-b1", "planB-t1", "seated") },
      },
      {
        tableId: "planB-t2",
        action: {
          type: "SET",
          session: session("s-b2", "planB-t2", "ordering"), // local-only
        },
      },
    ] as any);
  });

  it("preserves other plans' sessions, syncs/clears only snapshot tables", () => {
    const store = useTableSessionStore.getState();

    // Snapshot for plan B only: t1 still has a session (updated), t3 free.
    store._patchSessionsFromTables([
      tableWith("planB-t1", session("s-b1", "planB-t1", "ordered")),
      tableWith("planB-t3", undefined),
    ]);

    const sessions = useTableSessionStore.getState().sessions;
    // Plan A untouched — NOT in the snapshot.
    expect(sessions["planA-t1"]?.id).toBe("s-a1");
    expect(sessions["planA-t1"]?.status).toBe("seated");
    // Plan B t1 synced.
    expect(sessions["planB-t1"]?.status).toBe("ordered");
    // Plan B t2: not in snapshot either (e.g. filtered) — preserved.
    expect(sessions["planB-t2"]?.status).toBe("ordering");
  });

  it("clears a snapshot table whose session disappeared (genuinely freed)", () => {
    const store = useTableSessionStore.getState();

    store._patchSessionsFromTables([
      tableWith("planB-t1", undefined), // freed on the backend
    ]);

    const sessions = useTableSessionStore.getState().sessions;
    expect(sessions["planB-t1"]).toBeFalsy();
    // Other plan still intact.
    expect(sessions["planA-t1"]?.id).toBe("s-a1");
  });

  it("never clears local-only statuses even for snapshot tables", () => {
    const store = useTableSessionStore.getState();

    store._patchSessionsFromTables([
      tableWith("planB-t2", undefined), // backend says free, local says ordering
    ]);

    expect(
      useTableSessionStore.getState().sessions["planB-t2"]?.status,
    ).toBe("ordering");
  });
});
