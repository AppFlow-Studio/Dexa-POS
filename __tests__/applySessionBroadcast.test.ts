import { applySessionBroadcast } from "@/lib/floor/applySessionBroadcast";
import type { FloorPlanObject, TableSession } from "@/types/db-floor-plan-types";

const table = (id: string, session?: Partial<TableSession>): FloorPlanObject =>
  ({
    id,
    name: id,
    session: session ? ({ ...baseSession, ...session } as TableSession) : undefined,
  }) as unknown as FloorPlanObject;

const baseSession: TableSession = {
  id: "s1",
  session_number: "1",
  status: "seated",
  party_size: 2,
  seated_at: "2026-09-25T12:00:00Z",
  current_course: 1,
  needs_attention: false,
  is_vip: false,
};

const payload = (
  session: Record<string, unknown> | null,
  tableIds: string[] | null = ["t1"],
) => ({
  operation: "UPDATE",
  timestamp: "2026-09-25T12:01:00Z",
  data: {
    session,
    tables: tableIds ? tableIds.map((id) => ({ table_id: id, is_primary: true })) : null,
  },
});

const never = () => false;

describe("applySessionBroadcast", () => {
  it("returns null without is_active (database predates the payload fields)", () => {
    const res = applySessionBroadcast(
      [table("t1")],
      payload({ id: "s1", status: "seated" }),
      never,
    );
    expect(res).toBeNull();
  });

  it("returns null for a missing session (e.g. DELETE)", () => {
    expect(applySessionBroadcast([table("t1")], { operation: "DELETE", data: null }, never)).toBeNull();
  });

  it("seats a new session on its tables and records merged tables", () => {
    const res = applySessionBroadcast(
      [table("t1"), table("t2"), table("t3")],
      payload(
        { id: "s9", status: "seated", is_active: true, party_size: 6, server_staff_id: "staff-1" },
        ["t1", "t2"],
      ),
      never,
    )!;
    expect(res.changedTables.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(res.tables[0].session).toMatchObject({
      id: "s9",
      status: "seated",
      party_size: 6,
      server_staff_id: "staff-1",
      merged_tables: ["t1", "t2"],
    });
    expect(res.tables[2].session).toBeUndefined();
  });

  it("moves a session: frees the old table, sets the new one", () => {
    const res = applySessionBroadcast(
      [table("t1", { id: "s1" }), table("t2")],
      payload({ id: "s1", status: "ordered", is_active: true }, ["t2"]),
      never,
    )!;
    expect(res.tables[0].session).toBeUndefined();
    expect(res.tables[1].session?.id).toBe("s1");
    expect(res.changedTables.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("frees the tables of an inactive or cleaning session", () => {
    for (const session of [
      { id: "s1", status: "paid", is_active: false },
      { id: "s1", status: "cleaning", is_active: true },
    ]) {
      const res = applySessionBroadcast([table("t1", { id: "s1" })], payload(session), never)!;
      expect(res.tables[0].session).toBeUndefined();
      expect(res.changedTables).toHaveLength(1);
    }
  });

  it("never overwrites a live local-only status of the same session", () => {
    const res = applySessionBroadcast(
      [table("t1", { id: "s1", status: "paying" })],
      payload({ id: "s1", status: "served", is_active: true }),
      never,
    )!;
    expect(res.tables[0].session?.status).toBe("paying");
    expect(res.changedTables).toHaveLength(0);
  });

  it("replaces a different session even if it had a local-only status", () => {
    const res = applySessionBroadcast(
      [table("t1", { id: "old", status: "seating" })],
      payload({ id: "s2", status: "seated", is_active: true }),
      never,
    )!;
    expect(res.tables[0].session?.id).toBe("s2");
  });

  it("treats a session cleared locally within the TTL as gone", () => {
    const res = applySessionBroadcast(
      [table("t1", { id: "s1" })],
      payload({ id: "s1", status: "served", is_active: true }),
      (id) => id === "s1",
    )!;
    expect(res.tables[0].session).toBeUndefined();
  });

  it("keeps fields the broadcast doesn't carry on the same session", () => {
    const res = applySessionBroadcast(
      [table("t1", { id: "s1", reservation_id: "r1", guest_notes: "window" })],
      payload({ id: "s1", status: "served", is_active: true }),
      never,
    )!;
    expect(res.tables[0].session).toMatchObject({
      reservation_id: "r1",
      guest_notes: "window",
      status: "served",
    });
  });
});
