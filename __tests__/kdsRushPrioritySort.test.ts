import fs from "fs";
import path from "path";

function read(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

describe("KDS rush / priority top-band sort", () => {
  const migration = read(
    "supabase",
    "migrations",
    "20260712120000_kds_rush_priority_sort.sql",
  );
  const store = read("stores", "useKDSStore.ts");
  const screen = read("app", "(main)", "kds.tsx");
  const types = read("types", "kds.ts");

  it("preserves the RPC security contract", () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it("adds ticket-level any_rush and sorts the RPC top band before normal tickets", () => {
    expect(migration).toMatch(/bool_or\(COALESCE\(oi\.rush,\s*false\)\)\s+AS any_rush/);
    expect(migration).toMatch(/'any_rush',\s*oi_grouped\.any_rush/);
    expect(migration).toMatch(/'prioritized',\s*oi_grouped\.any_prioritized/);
    expect(migration).toMatch(
      /COALESCE\(\(ticket->>'any_rush'\)::boolean,\s*false\)\s+OR\s+COALESCE\(\(ticket->>'prioritized'\)::boolean,\s*false\)\s*\)\s+DESC/,
    );
    expect(migration).toMatch(/ticket->>'start_time'\s+ASC\s+NULLS\s+LAST/);
  });

  it("exposes any_rush on the POS KDS ticket type", () => {
    expect(types).toMatch(/any_rush\?:\s*boolean/);
  });

  it("keeps rushed and prioritized tickets elevated in the store", () => {
    expect(store).toMatch(/function isKdsTicketElevated/);
    expect(store).toMatch(/Boolean\(ticket\.prioritized\)/);
    expect(store).toMatch(/Boolean\(ticket\.any_rush\)/);
    expect(store).toMatch(/Boolean\(prioritizedIds\?\.has\(ticket\.ticket_id\)\)/);
    expect(store).toMatch(/Boolean\(item\.rush\)\s*\|\|\s*Boolean\(item\.is_prioritized\)/);
    expect(store).toMatch(
      /Number\(isKdsTicketElevated\(b\)\)\s*-\s*Number\(isKdsTicketElevated\(a\)\)/,
    );
  });

  it("keeps the final active KDS layout sort from undoing elevated order", () => {
    const layoutSort = screen.slice(
      screen.indexOf("const ticketsForLayout"),
      screen.indexOf("const activeTabCounts"),
    );
    expect(layoutSort).toContain('activeStatus !== "done"');
    expect(layoutSort).toMatch(
      /Number\(isTicketElevated\(b\)\)\s*-\s*Number\(isTicketElevated\(a\)\)/,
    );
  });
});
