/**
 * Phase 2 — every kitchen send is scoped to the items actually being fired.
 *
 * K3/K4/K5 built their batches by scanning the order for anything already at
 * the sent status (or, in pre-auth, anything with a db id). That re-fired lines
 * the main send already handled, which S2 shows moves items onto fresh KDS
 * tickets and resets their timers.
 *
 * This suite asserts the scans are gone and each site carries its explicit set:
 *  - retroactive "last sibling" sends → only the item that just synced
 *  - pre-auth → only items this auth just marked sent
 *  - post-payment commit → the explicit set captured by addPaymentToOrder
 *  - SQL → a re-fire preserves fire_time (COALESCE), so the KDS ticket is stable
 *
 * Structural assertions on real sources; running the live runtime path needs
 * Supabase plus a live queue (see sibling suites).
 */
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");
const websiteRoot = join(repoRoot, "..", "DexaPOS-Website");
const storeSrc = readFileSync(join(repoRoot, "stores", "useOrderStore.ts"), "utf8");
const preAuthSrc = readFileSync(
  join(repoRoot, "services", "preAuthService.ts"),
  "utf8",
);
const traceabilityMigration = readFileSync(
  join(websiteRoot, "supabase", "migrations", "20260814130000_kds_routing_traceability.sql"),
  "utf8",
);
// The re-fire fix ships as a new migration in the POS repo.
const refireMigration = readFileSync(
  join(repoRoot, "supabase", "migrations", "20260827160000_fix_kds_refire_preserves_fire_time.sql"),
  "utf8",
);

describe("K3 — retroactive 'last sibling' send is scoped to the synced item", () => {
  it("no longer scans the order for every item at the sent status", () => {
    expect(storeSrc).not.toContain("firedSyncedItems");
    // The old open-item scan:
    expect(storeSrc).not.toContain(
      "i.kitchen_status === kitchenSentStatus && i.db_order_item_id",
    );
    expect(storeSrc).not.toContain(
      "i.kitchen_status === kitchenSentStatus2 && i.db_order_item_id",
    );
  });

  it("scopes both retro paths to the item that just resolved its db id", () => {
    const openItemScope = storeSrc.match(
      /const allDbItemIds = addResult\.order_item_id\r?\n(\s+)\? \[addResult\.order_item_id\]/,
    );
    const regularScope = storeSrc.match(
      /const allDbItemIds2 = addResult\.order_item_id\r?\n(\s+)\? \[addResult\.order_item_id\]/,
    );
    expect(openItemScope).not.toBeNull();
    expect(regularScope).not.toBeNull();
  });
});

describe("K4 — pre-auth fires only items it just marked sent", () => {
  it("carries a kitchen_status clause instead of a bare db-id scan", () => {
    const sendItemsBlock = preAuthSrc.match(
      /const sendItems = order\.items\.filter\([\s\S]*?\);/,
    );
    expect(sendItemsBlock).not.toBeNull();
    expect(sendItemsBlock![0]).toContain("item.db_order_item_id");
    expect(sendItemsBlock![0]).toContain(
      'item.kitchen_status === "new"',
    );
    expect(sendItemsBlock![0]).toContain("!item.kitchen_status");
    // The old bare scan is gone.
    expect(
      preAuthSrc.match(/const sendItems = order\.items\.filter\(\(item\) => item\.db_order_item_id\);/),
    ).toBeNull();
  });
});

describe("K5 — post-payment commit fires the payment's explicit set", () => {
  it("captures the items a payment newly marks sent", () => {
    expect(storeSrc).toContain("kitchenSentLocalItemIds");
    expect(storeSrc).toMatch(
      /const kitchenSentLocalItemIds: string\[\] = updatedItems/,
    );
    // The capture keys off the unsent → sent transition, not the status value.
    expect(storeSrc).toMatch(/const wasUnsent =/);
  });

  it("threads the explicit set into the post-payment kitchen commit", () => {
    // The commit prefers the explicit set over a scan.
    expect(storeSrc).toMatch(
      /explicitKitchenSentIds && explicitKitchenSentIds\.length > 0/,
    );
    // The old hardcoded scan is gone.
    expect(storeSrc).not.toContain(
      '.filter((i) => i.kitchen_status === "sent")',
    );
  });

  it("falls back mode-aware (getKitchenSentStatus), so 2-step is not missed", () => {
    const commitBlock = storeSrc.slice(storeSrc.indexOf("Send items to kitchen if payment"));
    expect(commitBlock).toContain("getKitchenSentStatus()");
  });
});

describe("S2 — a re-fire preserves the original KDS ticket", () => {
  it("the NEW migration applies the COALESCE fix for the 'sent' branch", () => {
    expect(refireMigration).toContain(
      "WHEN p_status = 'sent' THEN COALESCE(fire_time, v_now)",
    );
    // The already-applied 20260814130000 migration is kept pristine (it was
    // deployed to the live DB before the audit); the fix ships as a new
    // migration, never by rewriting an applied one.
    expect(traceabilityMigration).toMatch(
      /WHEN p_status = 'sent' THEN v_now/,
    );
  });

  it("no longer rewrites fire_time unconditionally on re-fire", () => {
    expect(refireMigration).not.toMatch(
      /WHEN p_status = 'sent' THEN v_now/,
    );
  });

  it("keeps the exact deployed function signature", () => {
    expect(refireMigration).toContain(
      "p_expected_sync_version integer DEFAULT NULL",
    );
    expect(refireMigration).toContain("RETURNS jsonb");
  });
});
