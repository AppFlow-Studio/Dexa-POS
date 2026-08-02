import fs from "fs";
import path from "path";

function read(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

describe("KDS server-authoritative Done", () => {
  const migration = read(
    "supabase",
    "migrations",
    "20260717120000_kds_server_authoritative_done.sql",
  );
  const store = read("stores", "useKDSStore.ts");
  const types = read("types", "kds.ts");

  it("preserves the RPC security contract", () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_kds_tickets_v2\(uuid, text\[\], uuid\) TO authenticated/,
    );
  });

  it("returns recently served rounds as server Done tickets with done_time", () => {
    expect(migration).toMatch(/v_done_retention interval := interval '1 hour'/);
    expect(migration).toMatch(/oi\.kitchen_status = 'served'/);
    expect(migration).toMatch(/COALESCE\(oi\.updated_at, oi\.completed_at\) >= now\(\) - v_done_retention/);
    expect(migration).toMatch(/'status', CASE\s+WHEN oi_grouped\.any_done_items AND NOT oi_grouped\.any_active_items THEN 'done'/);
    expect(migration).toMatch(/'done_time', oi_grouped\.done_time/);
    expect(migration).toMatch(/o\.status = 'completed' AND oi_grouped\.any_done_items/);
  });

  it("keeps the existing active KDS contract intact", () => {
    expect(migration).toMatch(/'ready_time', oi_grouped\.ready_time/);
    expect(migration).toMatch(/'server_name', CASE\s+WHEN v_show_server_name THEN/);
    expect(migration).toMatch(/'any_rush', oi_grouped\.any_rush/);
    expect(migration).toMatch(/'prioritized', oi_grouped\.any_prioritized/);
    expect(migration).toMatch(/COALESCE\(\(ticket->>'any_rush'\)::boolean, false\)\s+OR\s+COALESCE\(\(ticket->>'prioritized'\)::boolean, false\)/);
  });

  it("types raw ready_time and done_time from the RPC payload", () => {
    expect(types).toMatch(/ready_time\?: string \| null/);
    expect(types).toMatch(/done_time\?: string \| null/);
  });

  it("splits server Done before active visibility filtering in both fetch paths", () => {
    expect(store).toMatch(/const KDS_DONE_TICKET_RETENTION_MS = 60 \* 60 \* 1000/);
    expect(store).toMatch(/function mergeDoneTickets/);
    expect(store).toMatch(/t\.status === "done"[\s\S]*safeParseUtcTimestamp\(t\.done_time\)/);
    expect(store).toMatch(/const serverDoneTickets = withAckOverlay[\s\S]*\.filter\(\(ticket\) => ticket\.status === "done"\)/);
    expect(store).toMatch(/const activeRemapped = withAckOverlay\.filter\(\s*\(ticket\) => ticket\.status !== "done"/);
    expect(store).toMatch(/const visibleRemapped = activeRemapped\.filter\(ticketShouldRemainVisible\)/);
    expect(store).toMatch(/if \(!changed && !doneChanged && get\(\)\._hasHydrated\)/);
    expect(store).toMatch(/doneTickets: nextDoneTickets/);
    expect(store).toMatch(/doneCount: nextDoneTickets\.length/);
  });

  it("does not rebuild served rows into active tickets from realtime broadcasts", () => {
    expect(store).toMatch(/const KDS_STATUSES = new Set\(\["sent", "preparing", "ready"\]\)/);
    expect(store).toMatch(/return KDS_STATUSES\.has\(item\.kitchen_status\)/);
    expect(store).toMatch(/status === "served"\s*\|\|\s*status === "voided"\s*\|\|\s*status === "done"\s*\|\|\s*status === "completed"/);
  });
});
