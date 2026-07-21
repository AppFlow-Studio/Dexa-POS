/**
 * Source-side guard: fetchFloorPlanSnapshot must preserve a live local-only
 * status by consulting useTableSessionStore.getState().sessions — even when
 * currentTablesById is EMPTY. That empty-context case is exactly:
 *   - prefetchFloorPlan(id): calls fetchFloorPlanSnapshot(id) with no currentTablesById
 *   - cache-MISS reload: setActiveFloorPlan resets tables:[]/tablesById:{} before
 *     loadFloorPlanStatus passes get().tablesById (now empty) to the snapshot fetch
 * Without this, those paths bake backend statuses into the cache/snapshot and the
 * subsequent _patchSessionsFromTables SYNC wipes the live local-only status.
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

jest.mock("@/services/floorPlanService", () => ({
  FloorPlanService: {
    getAllFloorPlanObjects: jest.fn(),
    getServerSections: jest.fn(),
  },
}));

jest.mock("@/stores/useReservationStore", () => ({
  useReservationStore: {
    getState: () => ({ nextReservationByTableId: {} }),
  },
}));

import { FloorPlanService } from "@/services/floorPlanService";
import {
  fetchFloorPlanSnapshot,
  setFloorPlanSupabaseClient,
} from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

const backendSession = (id: string, tableId: string, status: string) =>
  ({
    id,
    table_id: tableId,
    status,
    party_size: 2,
    order_id: null,
    is_active: true,
  }) as any;

describe("fetchFloorPlanSnapshot local-only preserve from session store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setFloorPlanSupabaseClient({} as any);
    useTableSessionStore.setState({ sessions: {}, sessionTableIndex: {} } as any);
    (FloorPlanService.getServerSections as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it("preserves a live local-only session even with EMPTY currentTablesById", async () => {
    // Live local-only session lives ONLY in the session store (no currentTablesById).
    useTableSessionStore.getState().batchDispatch([
      {
        tableId: "t1",
        action: {
          type: "SET",
          session: backendSession("s-1", "t1", "ordering"),
        },
      },
    ] as any);

    // Backend snapshot for the SAME session reports a synced status.
    (FloorPlanService.getAllFloorPlanObjects as jest.Mock).mockResolvedValue({
      data: [{ id: "t1", session: backendSession("s-1", "t1", "seated") }],
      error: null,
    });

    const { data, error } = await fetchFloorPlanSnapshot("plan-1", {});

    expect(error).toBeNull();
    const table = data?.tables.find((t) => t.id === "t1");
    expect(table?.session?.id).toBe("s-1");
    expect(table?.session?.status).toBe("ordering"); // preserved, not 'seated'
  });

  it("does NOT preserve a non-local-only session (lets the backend status through)", async () => {
    useTableSessionStore.getState().batchDispatch([
      {
        tableId: "t2",
        action: { type: "SET", session: backendSession("s-2", "t2", "seated") },
      },
    ] as any);

    (FloorPlanService.getAllFloorPlanObjects as jest.Mock).mockResolvedValue({
      data: [{ id: "t2", session: backendSession("s-2", "t2", "ordered") }],
      error: null,
    });

    const { data } = await fetchFloorPlanSnapshot("plan-1", {});
    const table = data?.tables.find((t) => t.id === "t2");
    expect(table?.session?.status).toBe("ordered");
  });

  it("does NOT preserve when the backend reports a DIFFERENT session id (turnover)", async () => {
    useTableSessionStore.getState().batchDispatch([
      {
        tableId: "t3",
        action: {
          type: "SET",
          session: backendSession("s-old", "t3", "ordering"),
        },
      },
    ] as any);

    (FloorPlanService.getAllFloorPlanObjects as jest.Mock).mockResolvedValue({
      data: [{ id: "t3", session: backendSession("s-new", "t3", "seated") }],
      error: null,
    });

    const { data } = await fetchFloorPlanSnapshot("plan-1", {});
    const table = data?.tables.find((t) => t.id === "t3");
    expect(table?.session?.id).toBe("s-new");
    expect(table?.session?.status).toBe("seated");
  });
});
