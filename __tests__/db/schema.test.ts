/**
 * Phase 1 acceptance — schema invariants.
 *
 * These are static assertions against the DDL text. They exist because the
 * things they check are structural guarantees the plan makes, and a structural
 * guarantee that nothing enforces is just a comment.
 */
import {
  DROP_STATEMENTS,
  PRAGMAS,
  SCHEMA_STATEMENTS,
  SCHEMA_VERSION,
  TABLES,
} from "@/lib/db/schema";

const DDL = SCHEMA_STATEMENTS.join("\n");

describe("schema — the PIN line", () => {
  /**
   * The hard line from the plan (§5.3 / §11). expo-sqlite is UNENCRYPTED.
   * `location_members` carries pin_plain, pin_code AND pin_hashed; mirroring
   * any of them here would move a plaintext credential out of the AES-256 MMKV
   * bucket and into a readable file — strictly worse than today, and it buys
   * nothing because offline PIN login already works from useEmployeeStore.
   *
   * Enforced structurally: there is nowhere to put a PIN, so one cannot be
   * mirrored by accident. This test is what keeps that true.
   */
  it("has no PIN column anywhere in the schema", () => {
    expect(DDL).not.toMatch(/pin_plain/i);
    expect(DDL).not.toMatch(/pin_hashed/i);
    expect(DDL).not.toMatch(/pin_code/i);
    // Catch a creatively-named reintroduction too.
    expect(DDL).not.toMatch(/\bpin\b/i);
  });

  it("staff table carries identity and role, but no credential", () => {
    const staff = SCHEMA_STATEMENTS.find((s) =>
      s.includes("CREATE TABLE IF NOT EXISTS staff"),
    );
    expect(staff).toBeDefined();
    expect(staff).toMatch(/staff_profile_id/);
    expect(staff).toMatch(/role_code/);
    expect(staff).not.toMatch(/pin/i);
  });
});

describe("schema — column naming contract", () => {
  /**
   * A column with no underscore prefix must exist on the remote Postgres table
   * under that exact name; a `_` prefix means local-only and never pushed.
   * That convention is what makes "would this ever be sent to the server?"
   * answerable by looking at the column.
   */
  const LOCAL_ONLY = [
    "_sync_status",
    "_base_version",
    "_lamport",
    "_device_id",
    "_business_day",
    "_server_seen_at",
  ];

  it("declares every local-only column with an underscore prefix", () => {
    for (const col of LOCAL_ONLY) {
      expect(DDL).toContain(col);
    }
  });

  it("uses the real remote column names, not invented ones", () => {
    // Regression guards for names an earlier draft of the plan got wrong.
    expect(DDL).toMatch(/total_amount_minor/); // NOT total_cents
    expect(DDL).toMatch(/item_name/); // NOT name, on order_items
    expect(DDL).toMatch(/availability/); // NOT is_available, on menu_items
    expect(DDL).toMatch(/last_order_date/); // NOT last_order_at
    expect(DDL).not.toMatch(/total_cents/);
    expect(DDL).not.toMatch(/price_cents/);
  });

  it("carries the dual-pricing columns, which are structural here", () => {
    for (const col of [
      "card_subtotal_minor",
      "card_total_minor",
      "cash_subtotal_minor",
      "cash_total_minor",
      "cash_amount_due_minor",
    ]) {
      expect(DDL).toContain(col);
    }
  });

  it("never stores money in a floating-point column", () => {
    // REAL is IEEE-754. The only legitimate REAL columns are physical
    // quantities on inventory (stock levels, reorder points) — never money.
    const realColumns = DDL.match(/^\s*(\w+)\s+REAL/gm) ?? [];
    const names = realColumns.map((m) => m.trim().split(/\s+/)[0]);
    expect(names.sort()).toEqual(["current_stock", "reorder_point"]);
  });
});

describe("schema — identity invariant", () => {
  it("installs a trigger that makes an order id immutable", () => {
    expect(DDL).toMatch(/CREATE TRIGGER IF NOT EXISTS no_order_id_rewrite/);
    expect(DDL).toMatch(/RAISE\(ABORT, 'order id is immutable'\)/);
  });
});

describe("schema — teardown completeness", () => {
  it("drops every table it creates", () => {
    for (const table of TABLES) {
      expect(DROP_STATEMENTS).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  it("drops children before parents so foreign keys never block", () => {
    const items = DROP_STATEMENTS.indexOf("DROP TABLE IF EXISTS order_items");
    const orders = DROP_STATEMENTS.indexOf("DROP TABLE IF EXISTS orders");
    expect(items).toBeLessThan(orders);
  });

  it("drops the trigger before its table", () => {
    expect(DROP_STATEMENTS[0]).toMatch(/DROP TRIGGER/);
  });
});

describe("schema — Track A pragmas", () => {
  it("uses WAL with synchronous=NORMAL while the DB is disposable", () => {
    expect(PRAGMAS).toContain("PRAGMA journal_mode = WAL");
    expect(PRAGMAS).toContain("PRAGMA foreign_keys = ON");
    // Flips to FULL at the Track A -> Track B boundary, in the same commit
    // that closes the drop-and-rebuild escape hatch. If this assertion is
    // failing because someone set FULL, check SCHEMA_REBUILD_IS_SAFE went
    // false in the same change.
    expect(PRAGMAS).toContain("PRAGMA synchronous = NORMAL");
  });

  it("has a schema version", () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
