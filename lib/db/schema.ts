/**
 * Local SQLite schema — Track A (read layer).
 *
 * Column naming contract (docs/engineering/architecture/sqlite-offline-first.md §7.1):
 *
 *   - A column with NO underscore prefix exists on the remote Postgres table
 *     under that EXACT name. Never rename, never re-derive.
 *   - A column with a `_` prefix is local-only: it has no remote counterpart
 *     and must never be pushed. `_sync_status`, `_lamport`, `_business_day`…
 *
 * That one convention makes "would this column ever be sent to the server?"
 * answerable by looking at it, and turns an accidental push of a local-only
 * field into a review-visible mistake rather than a runtime surprise.
 *
 * Money: remote money columns are Postgres `numeric`. SQLite has no decimal
 * type and REAL is floating point, which the project rule forbids. Money is
 * promoted here as INTEGER minor units for aggregation/sorting ONLY — the
 * exact server value lives in `payload` and every display path reads it
 * through decimal.js. See lib/db/money.ts.
 *
 * Track A policy: this schema is a pure projection of server state, so a
 * version bump DROPS and rebuilds rather than migrating. That escape hatch
 * closes at the Track A → Track B boundary (Phase 6), when the local DB starts
 * holding rows the server does not have.
 */

/**
 * Bump to force a drop-and-rebuild on next boot. Legitimate for the whole of
 * Track A: every row is refetchable from the server.
 *
 * v6 (2026-08-28): orders payload gains the server-history embeds
 * (created_by_staff, stations, online_orders, order_discounts) plus
 * delivery_platform / metadata, so local Previous Orders renders identically
 * to the server path. Existing payloads lack them, so a rebuild re-pulls every
 * order with the new shape.
 *
 * v7 (2026-08-28, Phase 4): the menu block is rebuilt to carry the whole
 * `get_pos_bootstrap_v1` envelope — a `menus` root, per-menu category and item
 * junction rows under composite keys, and one `menu_bootstrap` row for the
 * parts of the envelope that are not the tree (recipes, snoozes). Orders gain
 * `_search_customer_name`, the case-folded column that closes the `ilike` vs
 * `LIKE` search-parity gap Phase 3 left open.
 *
 * v8 (2026-08-30, Phase 5): `inventory_items` and `vendors` become a real
 * snapshot rather than storage-policy placeholders — each row keeps its
 * position in `_ordinal` and its raw wire rows in `payload`, so the mirror
 * rebuilds the sync inputs and runs the SAME mapping the live path runs.
 * `inventory_items` gains `_ordinal`; both gain their ordering index.
 *
 * v9 (2026-08-31, Phase 5 · analytics): two money columns are PROMOTED that
 * were previously payload-only — `order_payments.total_amount_minor` and
 * `order_items.price_paid_minor`. Both are required by the analytics
 * aggregate, and neither can be read out of `payload`: `json_extract` on a
 * JSON number yields a REAL, and putting currency through a float is exactly
 * what §7.1 forbids. Existing rows have no value for either, so a rebuild
 * re-pulls every order with the new shape. `order_payments` also gains
 * `idx_op_loc_initiated`, the index the analytics payments scan keys on.
 *
 * v10 (2026-08-31, Phase 5 · customers): `customers` stops being a
 * storage-policy placeholder and becomes a real snapshot. It gains
 * `location_id` (the location the row was MIRRORED for — the same deliberate
 * bend the menu documents, since remote `customers` is merchant-scoped and has
 * no location at all), a composite `(location_id, id)` key, `_ordinal` to
 * preserve the server's ordering, promoted `address`, and the three folded
 * search columns the type-ahead matches on. The bare `idx_c_name` is dropped —
 * see the note on the table.
 *
 * At Phase 6 this becomes a forward-only migration ladder and this comment,
 * along with `rebuildIsSafe`, has to go.
 */
export const SCHEMA_VERSION = 10;

/**
 * True while the local DB is a disposable projection. Read by the migration
 * runner to decide "drop and rebuild" vs "refuse and demand a migration".
 * Flip to false in the same commit that flips PRAGMA synchronous to FULL.
 */
export const SCHEMA_REBUILD_IS_SAFE = true;

/** Tables in dependency order (parents first) — DROP walks this in reverse. */
export const TABLES = [
  "orders",
  "order_items",
  "order_payments",
  "menu_bootstrap",
  "menus",
  "menu_categories",
  "menu_items",
  "modifier_groups",
  "menu_item_modifier_groups",
  "inventory_items",
  "vendors",
  "customers",
  "staff",
  "sync_state",
] as const;

export type TableName = (typeof TABLES)[number];

/**
 * Conflict target for the upsert in lib/db/write.ts, for tables whose primary
 * key is NOT a single leading `id` column.
 *
 * Declared here rather than inferred, because `ON CONFLICT` has to name the
 * exact key columns and getting it wrong is silent: SQLite raises a constraint
 * error the write boundary swallows into a rolled-back batch, which looks like
 * "the mirror is empty" rather than "the conflict target is wrong". A test
 * asserts every composite-PK table in the DDL appears here.
 *
 * Tables absent from this map upsert on their first column, which is the
 * primary key by descriptor convention.
 */
export const TABLE_CONFLICT_KEYS: Partial<Record<TableName, readonly string[]>> =
  {
    menus: ["location_id", "id"],
    menu_categories: ["location_id", "menu_id", "id"],
    menu_items: ["location_id", "menu_id", "id"],
    modifier_groups: ["location_id", "id"],
    menu_item_modifier_groups: [
      "location_id",
      "menu_item_id",
      "modifier_group_id",
    ],
    menu_bootstrap: ["location_id"],
    inventory_items: ["location_id", "id"],
    vendors: ["location_id", "id"],
    customers: ["location_id", "id"],
    sync_state: ["entity", "location_id"],
  };

/**
 * PRAGMAs applied on every open, in this order.
 *
 * `synchronous = NORMAL` is correct for Track A ONLY: under WAL it can lose the
 * last commits on an OS crash, which for a pure projection costs a refetch.
 * It becomes FULL at the Track B boundary, where a lost commit is a lost order.
 */
export const PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA foreign_keys = ON",
  "PRAGMA synchronous = NORMAL",
  // Without this, SQLite's busy handler is a no-op and ANY transient lock —
  // a checkpoint, a concurrent writer on the same connection — fails the
  // statement instantly with "database is locked". The app has background
  // writers (delta sync, measurement, manifest), so a 5s wait turns those
  // transient conflicts into a delay instead of a dropped write.
  "PRAGMA busy_timeout = 5000",
] as const;

export const SCHEMA_STATEMENTS: string[] = [
  // ==========================================================================
  // ORDERS — column names match public.orders exactly.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS orders (
    id                    TEXT PRIMARY KEY NOT NULL,
    location_id           TEXT NOT NULL,
    merchant_id           TEXT,
    order_number          TEXT,
    display_number        TEXT,
    order_type            TEXT,
    order_source          TEXT,
    status                TEXT,
    payment_status        TEXT,
    check_status          TEXT,
    customer_id           TEXT,
    customer_name         TEXT,
    customer_phone        TEXT,
    customer_email        TEXT,
    table_number          TEXT,
    seat_number           TEXT,
    session_id            TEXT,
    assigned_server_id    TEXT,
    created_by_staff_id   TEXT,
    station_id            TEXT,
    device_id             TEXT,

    -- Money, minor units. Dual pricing is structural, not a variant.
    subtotal_minor            INTEGER,
    tax_amount_minor          INTEGER,
    total_amount_minor        INTEGER,
    discount_amount_minor     INTEGER,
    service_charge_minor      INTEGER,
    tip_amount_minor          INTEGER,
    amount_due_minor          INTEGER,
    amount_paid_minor         INTEGER,
    card_subtotal_minor       INTEGER,
    card_tax_amount_minor     INTEGER,
    card_total_minor          INTEGER,
    cash_subtotal_minor       INTEGER,
    cash_tax_amount_minor     INTEGER,
    cash_total_minor          INTEGER,
    cash_amount_due_minor     INTEGER,
    cash_discount_amount_minor INTEGER,
    effective_total_minor     INTEGER,

    -- Tombstones. These are real remote columns and ride the updated_at
    -- watermark like any other change (§7.4) — the app voids, it does not
    -- hard-delete.
    voided_at             TEXT,
    void_reason           TEXT,
    voided_by             TEXT,
    cancelled_at          TEXT,
    cancellation_reason   TEXT,

    sent_to_kitchen_at    TEXT,
    ready_at              TEXT,
    completed_at          TEXT,
    is_offline            INTEGER,
    reopen_count          INTEGER,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    sync_version          INTEGER,

    -- Local-only. Inert through Track A.
    _sync_status          TEXT NOT NULL DEFAULT 'synced',
    _base_version         INTEGER,
    _lamport              INTEGER NOT NULL DEFAULT 0,
    _device_id            TEXT,
    _business_day         TEXT,
    -- Case-FOLDED customer name, written at sync time. SQLite's LIKE is
    -- case-insensitive for ASCII only, while Postgres ilike is not — so a
    -- search for "josé" matched online and missed offline, which is exactly
    -- the filter-parity gap historyQuery.ts exists to prevent. LOWER() and
    -- COLLATE NOCASE are both ASCII-only too; the fold has to happen in JS
    -- (toLocaleLowerCase) on the way in, which is what this column holds.
    _search_customer_name TEXT,
    _server_seen_at       TEXT NOT NULL,
    payload               TEXT NOT NULL
  )`,

  // The Previous Orders index (Phase 3). NOT partial, and it carries the `id`
  // tiebreak.
  //
  // The original was `... WHERE voided_at IS NULL`, which SQLite can only use
  // when the query's WHERE provably implies that predicate. Previous Orders
  // never mentions `voided_at` — it cannot, the "Voided" tab exists — so the
  // partial index was unusable by the one query it was built for, and every
  // page, count and summary fell back to a full sort of the location's window.
  // Silent at 40 rows/day, expensive at the 20k retention cap.
  //
  // `(created_at DESC, id ASC)` matches `historyOrderBySql`'s default sort term
  // for term, so the default page is an index scan with no temp b-tree at all.
  // The DROP is a one-boot no-op afterwards: `CREATE IF NOT EXISTS` cannot
  // redefine an index that already exists under the same name, so the old
  // partial one has to go by name.
  `DROP INDEX IF EXISTS idx_o_loc_created`,
  `CREATE INDEX IF NOT EXISTS idx_o_loc_created_v2
     ON orders(location_id, created_at DESC, id ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_o_bizday   ON orders(location_id, _business_day)`,
  `CREATE INDEX IF NOT EXISTS idx_o_number   ON orders(location_id, order_number)`,
  `CREATE INDEX IF NOT EXISTS idx_o_phone    ON orders(location_id, customer_phone)`,
  `CREATE INDEX IF NOT EXISTS idx_o_updated  ON orders(location_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_o_unsynced ON orders(_sync_status)
     WHERE _sync_status != 'synced'`,

  // The Identity Invariant, enforced by the database rather than by review.
  // Phase 6 relies on this; creating it now costs nothing and means no code
  // written during Track A can establish a rekeying habit.
  `CREATE TRIGGER IF NOT EXISTS no_order_id_rewrite
     BEFORE UPDATE OF id ON orders
     BEGIN SELECT RAISE(ABORT, 'order id is immutable'); END`,

  // ==========================================================================
  // ORDER ITEMS — column names match public.order_items exactly.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS order_items (
    id                    TEXT PRIMARY KEY NOT NULL,
    order_id              TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id          TEXT,
    menu_id               TEXT,
    category_id           TEXT,
    item_name             TEXT NOT NULL,
    category_name         TEXT,
    menu_name             TEXT,
    quantity              INTEGER,
    unit_price_minor            INTEGER,
    subtotal_minor              INTEGER,
    tax_amount_minor            INTEGER,
    -- Promoted for the analytics top-items aggregate ONLY, which reads
    -- "subtotal || price_paid" — remote subtotal is NOT NULL, so this is the
    -- fallback for a legitimately $0 subtotal. Payload-only would mean
    -- json_extract, which returns a REAL. See SCHEMA_VERSION v9.
    price_paid_minor            INTEGER,
    cash_unit_price_minor       INTEGER,
    cash_subtotal_minor         INTEGER,
    cash_tax_amount_minor       INTEGER,
    discount_amount_minor       INTEGER,
    pre_discount_subtotal_minor INTEGER,
    item_status           TEXT,
    kitchen_status        TEXT,
    course_number         INTEGER,
    seat_number           INTEGER,
    display_order         INTEGER,
    is_voided             INTEGER,
    voided_at             TEXT,
    void_reason           TEXT,
    is_to_go              INTEGER,
    is_prioritized        INTEGER,
    rush                  INTEGER,
    special_instructions  TEXT,
    kitchen_notes         TEXT,
    selected_size_id      TEXT,
    selected_size_name    TEXT,
    created_at            TEXT,
    updated_at            TEXT,
    _sync_status          TEXT NOT NULL DEFAULT 'synced',
    _lamport              INTEGER NOT NULL DEFAULT 0,
    _device_id            TEXT,
    payload               TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oi_order ON order_items(order_id)
     WHERE is_voided IS NOT 1`,
  `CREATE INDEX IF NOT EXISTS idx_oi_menu  ON order_items(menu_item_id)`,

  // ==========================================================================
  // ORDER PAYMENTS — remote has NO updated_at/created_at. `initiated_at` is
  // the closest thing to a watermark, which is why payments sync as children
  // of their parent order rather than on their own cursor.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS order_payments (
    id                     TEXT PRIMARY KEY NOT NULL,
    order_id               TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    location_id            TEXT,
    device_id              TEXT,
    payment_method         TEXT,
    -- The AUTHORITATIVE payment state (payment_status enum: pending, captured,
    -- void, refunded, partially_refunded). The is_* booleans below are
    -- denormalized conveniences that can disagree with it — remote indexes
    -- idx_order_payments_status and idx_order_payments_pending both key on
    -- status, and idx_order_payments_fees_location_period computes revenue
    -- from it. Anything deciding money reads status, not the booleans.
    status                 TEXT,
    amount_minor           INTEGER,
    tip_amount_minor       INTEGER,
    -- amount + tip as the SERVER computed it. Promoted in v9 because every
    -- analytics payment total reads total_amount and falls back to amount;
    -- recomputing amount+tip locally would be a second source of truth for
    -- what was actually collected.
    total_amount_minor     INTEGER,
    amount_tendered_minor  INTEGER,
    change_given_minor     INTEGER,
    dual_pricing_fee_minor INTEGER,
    discount_portion_minor INTEGER,
    is_cash_priced         INTEGER,
    is_voided              INTEGER,
    is_returned            INTEGER,
    is_settled             INTEGER,
    card_last_four         TEXT,
    card_type              TEXT,
    auth_code              TEXT,
    covers_items           TEXT,
    idempotency_key        TEXT,
    -- Settlement / refund lineage. Needed by End of Day and refunds (Phase 6);
    -- mirrored now because they arrive free with the row and adding them later
    -- would mean a schema change on a database holding real data.
    terminal_id            TEXT,
    payment_device_id      TEXT,
    settlement_batch_id    TEXT,
    parent_payment_id      TEXT,
    transaction_id         TEXT,
    split_portion_index    INTEGER,
    initiated_at           TEXT,
    approved_at            TEXT,
    captured_at            TEXT,
    failed_at              TEXT,
    voided_at              TEXT,
    payload                TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_op_order  ON order_payments(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_op_status ON order_payments(status)`,
  // Analytics scans payments by (location, initiated_at) window — the same
  // filter the server dashboard uses — INDEPENDENTLY of the parent order's
  // created_at. Without this the payments summary is a full table scan of
  // every payment the mirror holds at the 20k-order retention cap.
  `CREATE INDEX IF NOT EXISTS idx_op_loc_initiated
     ON order_payments(location_id, initiated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_op_batch  ON order_payments(settlement_batch_id)
     WHERE settlement_batch_id IS NOT NULL`,

  // ==========================================================================
  // MENU — the RESOLVED shape from get_pos_bootstrap_v1, NOT the remote table
  // graph. Remotely, effective price/availability is spread across menu_items,
  // a location override (custom_price / is_available), category_items and
  // menu_item_menus. Cloning those would mean re-implementing price resolution
  // on the device — a second source of truth for what an item costs. One
  // resolver, server-side, forever.
  //
  // ONE DELIBERATE BEND IN THE NAMING CONTRACT, and it is worth stating
  // plainly: `location_id` on every menu table is THE LOCATION THIS ROW WAS
  // RESOLVED FOR, not the row's ownership location. Remotely,
  // `menus.location_id` / `menu_items.location_id` are NULL for a global row
  // and a UUID for a location-owned one — a different question entirely. The
  // resolved projection is only meaningful per location, every index here is
  // location-leading, and the retention / purge / row-count machinery in
  // write.ts keys on `location_id`. The ownership value is preserved verbatim
  // inside `payload`, which is what the menu store reads.
  //
  // KEYS. Every menu key is LOCATION-LEADING, and both halves of that are
  // load-bearing:
  //
  //  - `location_id` leads because a global menu (merchant-wide, location_id
  //    NULL remotely) is RESOLVED per location — same menu id, different
  //    effective prices. A device that switches stores would otherwise have
  //    one location's resolved menu overwrite the other's, and the surviving
  //    row would carry the wrong prices under the right id.
  //  - `menu_id` is in the category and item keys because
  //    `menu_categories.id` and `category_items.id` are the remote JUNCTION
  //    ids: unique per (menu, category) and per (category, item), but NOT per
  //    menu. One global category can belong to several menus, and a
  //    per-location-menu override (price_levels.level_5_location_menu) can
  //    give the same item a different effective price in each. Keying on the
  //    junction id alone collapses those into one row and silently drops
  //    items from every menu but the last.
  //
  // There are deliberately NO foreign keys between these tables. The whole
  // location is cleared and rewritten in one transaction (EntityBatch
  // .replaceScope), so a cascade would only duplicate work the replace already
  // does — and a composite FK on (location_id, menu_id) buys nothing but a way
  // for a partial write to fail differently.
  // ==========================================================================

  // The envelope minus the tree: version, stamp, recipes and active snoozes.
  // One row per location. Local-only by nature — these are RPC payload fields,
  // not columns of any remote table — so the `_` convention is waived for the
  // whole table exactly as it is for sync_state.
  `CREATE TABLE IF NOT EXISTS menu_bootstrap (
    location_id                     TEXT PRIMARY KEY NOT NULL,
    version                         TEXT,
    synced_at                       TEXT,
    menu_item_ingredients           TEXT NOT NULL DEFAULT '[]',
    modifier_group_item_ingredients TEXT NOT NULL DEFAULT '[]',
    snoozes                         TEXT NOT NULL DEFAULT '[]',
    modifier_snoozes                TEXT NOT NULL DEFAULT '[]',
    _server_seen_at                 TEXT NOT NULL
  )`,

  // The entity root. `payload` is the menu verbatim MINUS `categories`, which
  // live in their own table — the same split the orders mirror uses, so a menu
  // is never stored twice.
  `CREATE TABLE IF NOT EXISTS menus (
    id              TEXT NOT NULL,
    location_id     TEXT NOT NULL,
    merchant_id     TEXT,
    name            TEXT,
    description     TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    display_order   INTEGER,
    created_at      TEXT,
    updated_at      TEXT,
    _ordinal        INTEGER NOT NULL DEFAULT 0,
    _server_seen_at TEXT NOT NULL,
    payload         TEXT NOT NULL,
    PRIMARY KEY (location_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_m_loc ON menus(location_id, _ordinal)`,

  `CREATE TABLE IF NOT EXISTS menu_categories (
    id             TEXT NOT NULL,
    menu_id        TEXT NOT NULL,
    category_id    TEXT NOT NULL,
    location_id    TEXT NOT NULL,
    merchant_id    TEXT,
    name           TEXT,
    description    TEXT,
    image          TEXT,
    display_order  INTEGER,
    is_active      INTEGER NOT NULL DEFAULT 1,
    updated_at     TEXT,
    _ordinal       INTEGER NOT NULL DEFAULT 0,
    _server_seen_at TEXT NOT NULL,
    payload        TEXT NOT NULL,
    PRIMARY KEY (location_id, menu_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_loc ON menu_categories(location_id, display_order)`,
  `CREATE INDEX IF NOT EXISTS idx_mc_menu
     ON menu_categories(location_id, menu_id, _ordinal)`,

  `CREATE TABLE IF NOT EXISTS menu_items (
    id               TEXT NOT NULL,
    menu_id          TEXT NOT NULL,
    menu_item_id     TEXT NOT NULL,
    category_id      TEXT NOT NULL,
    location_id      TEXT NOT NULL,
    merchant_id      TEXT,
    name             TEXT NOT NULL,
    description      TEXT,
    price_minor      INTEGER,
    cash_price_minor INTEGER,
    availability     INTEGER NOT NULL DEFAULT 1,
    image            TEXT,
    tax_category     TEXT,
    is_tax_exempt    INTEGER,
    dietary_flags    TEXT,
    allergens        TEXT,
    meal_types       TEXT,
    display_order    INTEGER,
    version          INTEGER,
    updated_at       TEXT,
    _ordinal         INTEGER NOT NULL DEFAULT 0,
    _server_seen_at  TEXT NOT NULL,
    payload          TEXT NOT NULL,
    PRIMARY KEY (location_id, menu_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mi_loc_cat
     ON menu_items(location_id, category_id, display_order)`,
  `CREATE INDEX IF NOT EXISTS idx_mi_avail ON menu_items(location_id, availability)`,
  // The lookup the kiosk and order entry actually make: "this menu item id,
  // wherever it appears". Not unique — see the KEYS note above.
  `CREATE INDEX IF NOT EXISTS idx_mi_item ON menu_items(location_id, menu_item_id)`,
  // The reassembly read, term for term.
  `CREATE INDEX IF NOT EXISTS idx_mi_menu
     ON menu_items(location_id, menu_id, category_id, _ordinal)`,

  // Deduplicated by group id: a modifier group's options and price_modifier
  // are resolved per LOCATION (location_modifier_group_overrides), never per
  // menu, so the same group is identical wherever it appears. Not used to
  // rebuild the tree — the groups ride inside each item's payload, exactly as
  // the server sends them — this is the queryable projection.
  `CREATE TABLE IF NOT EXISTS modifier_groups (
    id              TEXT NOT NULL,
    location_id     TEXT NOT NULL,
    name            TEXT,
    display_order   INTEGER,
    is_required     INTEGER,
    min_selections  INTEGER,
    max_selections  INTEGER,
    updated_at      TEXT,
    _server_seen_at TEXT NOT NULL,
    payload         TEXT NOT NULL,
    PRIMARY KEY (location_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mg_loc ON modifier_groups(location_id, display_order)`,

  `CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
    menu_item_id      TEXT NOT NULL,
    modifier_group_id TEXT NOT NULL,
    location_id       TEXT NOT NULL,
    display_order     INTEGER,
    PRIMARY KEY (location_id, menu_item_id, modifier_group_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mimg_loc
     ON menu_item_modifier_groups(location_id, menu_item_id)`,

  // ==========================================================================
  // INVENTORY — names match public.inventory_items / public.vendors.
  // current_stock is a physical quantity, not money: REAL is correct there.
  //
  // `payload` holds the RAW WIRE ROWS, not a mapped item: `{rpc, row}` for an
  // inventory item and the selected vendor row for a vendor. The read rebuilds
  // those inputs and runs the SAME mapping the live sync runs
  // (lib/inventory/inventorySyncPayload.ts), so a catalog rendered from disk
  // cannot diverge from one rendered from the network. Promoted columns exist
  // for SQL to filter and sort on; nothing displayed is read from them.
  //
  // KEYS are LOCATION-LEADING for the reason Phase 4 learned the hard way on
  // `menus`: stock, cost and reorder point are RESOLVED PER LOCATION out of
  // location_inventory_stock / location_inventory_overrides, so the same item
  // id means different numbers at different stores. Today's selects filter on
  // `location_id`, so only location-owned rows arrive and a single-column key
  // would happen to work — but "happens to work" is exactly what silently
  // broke when a device switched stores last time. Correct-looking data with
  // the wrong stock is invisible until someone counts a shelf.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS inventory_items (
    id                  TEXT NOT NULL,
    location_id         TEXT NOT NULL,
    vendor_id           TEXT,
    name                TEXT,
    category            TEXT,
    current_stock       REAL,
    unit_type           TEXT,
    reorder_point       REAL,
    cost_per_unit_minor INTEGER,
    stock_mode          TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT,
    updated_at          TEXT,
    -- Position in the array the live sync produced. updated_at is nullable
    -- and can tie, so it cannot order the catalog reproducibly; this can.
    _ordinal            INTEGER NOT NULL DEFAULT 0,
    _server_seen_at     TEXT NOT NULL,
    payload             TEXT NOT NULL,
    PRIMARY KEY (location_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ii_loc    ON inventory_items(location_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_ii_low    ON inventory_items(location_id, current_stock)`,
  `CREATE INDEX IF NOT EXISTS idx_ii_vendor ON inventory_items(location_id, vendor_id)`,
  // The reassembly read, term for term — an index scan with no temp b-tree.
  `CREATE INDEX IF NOT EXISTS idx_ii_ord    ON inventory_items(location_id, _ordinal)`,

  `CREATE TABLE IF NOT EXISTS vendors (
    id              TEXT NOT NULL,
    location_id     TEXT NOT NULL,
    name            TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    updated_at      TEXT,
    _ordinal        INTEGER NOT NULL DEFAULT 0,
    _server_seen_at TEXT NOT NULL,
    payload         TEXT NOT NULL,
    PRIMARY KEY (location_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_v_loc ON vendors(location_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_v_ord ON vendors(location_id, _ordinal)`,

  // ==========================================================================
  // CUSTOMERS — names match public.customers exactly, with ONE bend.
  //
  // `location_id` IS NOT A REMOTE COLUMN. Remote `customers` is scoped to a
  // MERCHANT and has no location at all. It is added here because the whole
  // write boundary — `pruneToRetention`, `writeSyncState`'s floor and row
  // count, `replaceScope`'s clear, the purge, the dev shadow-compare — is
  // written against `WHERE location_id = ?`, and every other mirrored table
  // has one. The alternative was teaching write.ts about a second scope
  // column, which would touch the transaction path all four existing entities
  // depend on to save one column on one table. So it means "the location this
  // row was mirrored FOR", exactly as the menu's does, and a device serving
  // two locations of one merchant holds the directory twice. That is bounded
  // (5,000 rows x ~786 B ~= 3.9 MB) and a device is location-bound in practice.
  //
  // `updated_at` IS NULLABLE ON REMOTE, which is why this is a SNAPSHOT entity
  // and not a keyset delta — the same fact that kept `table_sessions` out of
  // the analytics mirror. A cursor on a column that can be NULL either skips
  // those rows forever or orders unstably; there is no third option.
  //
  // THE SEARCH COLUMNS. `_search_name` and `_search_address` are case-FOLDED
  // in JS at ingest for the reason `orders._search_customer_name` documents:
  // SQLite's LIKE, LOWER() and COLLATE NOCASE are all ASCII-only while the
  // JS `.toLowerCase().includes()` these screens do today is not, so "José"
  // matched in the old client-side filter and would have missed in SQL.
  // `_search_phone` is digits-only, matching the `replace(/\D/g,"")` the
  // waitlist normalizes with, so "(555) 123" and "555123" find the same row.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS customers (
    id                   TEXT NOT NULL,
    location_id          TEXT NOT NULL,
    merchant_id          TEXT,
    name                 TEXT,
    phone                TEXT,
    email                TEXT,
    address              TEXT,
    is_active            INTEGER,
    vip_level            TEXT,
    total_orders         INTEGER,
    visits               INTEGER,
    lifetime_spend_minor INTEGER,
    avg_spend_minor      INTEGER,
    last_order_date      TEXT,
    last_visit           TEXT,
    created_at           TEXT,
    updated_at           TEXT,
    _ordinal             INTEGER NOT NULL DEFAULT 0,
    _search_name         TEXT,
    _search_phone        TEXT,
    _search_address      TEXT,
    _server_seen_at      TEXT NOT NULL,
    payload              TEXT NOT NULL,
    PRIMARY KEY (location_id, id)
  )`,
  // The directory read: the server's own ordering, preserved.
  `CREATE INDEX IF NOT EXISTS idx_c_loc_ord ON customers(location_id, _ordinal)`,
  // For EXACT / prefix phone lookups (findOrCreateCustomer, resolveCustomerId).
  // It does NOT serve the type-ahead: that is a `%contains%` match, and no
  // b-tree can serve a leading wildcard. At the 5,000-row cap the type-ahead is
  // a scan of one location's directory, which is what "start with LIKE" means
  // in the plan; FTS5 is the escalation if measurement ever demands it.
  `CREATE INDEX IF NOT EXISTS idx_c_loc_phone ON customers(location_id, _search_phone)`,
  // `idx_c_name` is deliberately NOT recreated. A bare b-tree on `name` cannot
  // serve `LIKE '%q%'`, so it only ever cost writes.
  `DROP INDEX IF EXISTS idx_c_phone`,
  `DROP INDEX IF EXISTS idx_c_name`,

  // ==========================================================================
  // STAFF — a JOIN of location_members x staff_profiles.
  //
  // THERE IS NO PIN COLUMN, AND THERE MUST NEVER BE ONE.
  // location_members carries pin_plain, pin_code AND pin_hashed. None of the
  // three appear here. expo-sqlite is unencrypted; PINs stay in the AES-256
  // MMKV bucket (secureMMKVStorage) where useEmployeeStore already keeps them,
  // and offline PIN login already works from there. Structural, not a
  // convention — a PIN cannot be mirrored by accident because there is nowhere
  // to put it. See __tests__/db/schema.test.ts, which fails if this changes.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS staff (
    location_member_id TEXT PRIMARY KEY NOT NULL,
    staff_profile_id   TEXT NOT NULL,
    location_id        TEXT NOT NULL,
    role_code          TEXT,
    employment_type    TEXT,
    is_active          INTEGER NOT NULL DEFAULT 1,
    display_name       TEXT,
    first_name         TEXT,
    last_name          TEXT,
    avatar_url         TEXT,
    updated_at         TEXT,
    _server_seen_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_s_loc ON staff(location_id, is_active)`,

  // ==========================================================================
  // SYNC BOOKKEEPING — one row per (entity, location). The delta engine's
  // cursor and the freshness UI both read from here. Local-only by nature, so
  // no `_` prefix convention applies: the whole table has no remote twin.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS sync_state (
    entity           TEXT NOT NULL,
    location_id      TEXT NOT NULL,
    watermark        TEXT,
    watermark_id     TEXT,
    last_success_at  TEXT,
    last_attempt_at  TEXT,
    last_error       TEXT,
    last_manifest_at TEXT,
    retention_floor  TEXT,
    row_count        INTEGER,
    retention_cap    INTEGER,
    PRIMARY KEY (entity, location_id)
  )`,
];

/** Reverse dependency order so FK constraints never block the drop. */
export const DROP_STATEMENTS: string[] = [
  "DROP TRIGGER IF EXISTS no_order_id_rewrite",
  ...[...TABLES].reverse().map((t) => `DROP TABLE IF EXISTS ${t}`),
];
