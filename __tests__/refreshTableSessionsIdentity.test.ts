/**
 * Tables screen slowness when busy: refreshTableSessions runs on every floor
 * broadcast. It must keep a table's OBJECT IDENTITY when its session did not
 * change — a fresh object per table per reconcile re-rendered the whole
 * Tables screen, every sidebar row and the context sheet.
 */
jest.mock("uuid", () => ({ v4: () => "00000000-0000-4000-8000-000000000000" }));

const mockStatusRows: any[] = [];
jest.mock("@/services/floorPlanService", () => ({
  FloorPlanService: {
    getLocationTableStatus: jest.fn(async () => ({ data: mockStatusRows, error: null })),
  },
}));

import {
  setFloorPlanSupabaseClient,
  useFloorPlanStore,
} from "@/stores/useFloorPlanStore";

const row = (tableId: string, sessionId: string | null, status = "seated") => ({
  table_id: tableId,
  session_id: sessionId,
  session_status: sessionId ? status : null,
  session_number: 1,
  party_size: 2,
  guest_name: null,
  guest_phone: null,
  order_id: null,
  server_staff_id: null,
  seated_at: "2026-09-25T20:45:00.000Z",
  current_course: 1,
  needs_attention: false,
  is_vip: false,
});

const table = (id: string) => ({ id, name: id }) as any;

describe("refreshTableSessions keeps unchanged tables' identity", () => {
  beforeEach(() => {
    setFloorPlanSupabaseClient({} as any);
    const tables = [table("t1"), table("t2"), table("t3")];
    useFloorPlanStore.setState({
      locationId: "loc-1",
      activeFloorPlanId: "fp-1",
      tables,
      tablesById: Object.fromEntries(tables.map((t) => [t.id, t])),
      floorPlanCache: {},
    } as any);
    mockStatusRows.length = 0;
  });

  it("only the table whose session changed gets a new object", async () => {
    mockStatusRows.push(row("t1", "s1"), row("t2", null), row("t3", "s3"));
    await useFloorPlanStore.getState().refreshTableSessions();
    const first = useFloorPlanStore.getState().tables;

    // Same snapshot again, except t3's status moved.
    mockStatusRows.length = 0;
    mockStatusRows.push(row("t1", "s1"), row("t2", null), row("t3", "s3", "ordered"));
    await useFloorPlanStore.getState().refreshTableSessions();
    const second = useFloorPlanStore.getState().tables;

    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second[2]).not.toBe(first[2]);
    expect(second[2].session?.status).toBe("ordered");
  });

  it("an identical snapshot does not write the tables array at all", async () => {
    mockStatusRows.push(row("t1", "s1"), row("t2", null));
    await useFloorPlanStore.getState().refreshTableSessions();
    const before = useFloorPlanStore.getState().tables;

    const listener = jest.fn();
    const unsub = useFloorPlanStore.subscribe((s, p) => {
      if (s.tables !== p.tables) listener();
    });
    await useFloorPlanStore.getState().refreshTableSessions();
    unsub();

    expect(useFloorPlanStore.getState().tables).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});
