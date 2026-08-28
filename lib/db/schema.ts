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
 * At Phase 6 this becomes a forward-only migration ladder and this comment,
 * along with `rebuildIsSafe`, has to go.
 */
export const SCHEMA_VERSION = 6;

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
    _server_seen_at       TEXT NOT NULL,
    payload               TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_o_loc_created
     ON orders(location_id, created_at DESC) WHERE voided_at IS NULL`,
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
  `CREATE INDEX IF NOT EXISTS idx_op_batch  ON order_payments(settlement_batch_id)
     WHERE settlement_batch_id IS NOT NULL`,

  // ==========================================================================
  // MENU — the RESOLVED shape from get_pos_bootstrap_v1, NOT the remote table
  // graph. Remotely, effective price/availability is spread across menu_items,
  // a location override (custom_price / is_available), category_items and
  // menu_item_menus. Cloning those would mean re-implementing price resolution
  // on the device — a second source of truth for what an item costs. One
  // resolver, server-side, forever.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS menu_categories (
    id             TEXT PRIMARY KEY NOT NULL,
    location_id    TEXT,
    merchant_id    TEXT,
    menu_id        TEXT,
    name           TEXT,
    description    TEXT,
    image          TEXT,
    display_order  INTEGER,
    is_active      INTEGER NOT NULL DEFAULT 1,
    updated_at     TEXT,
    _server_seen_at TEXT NOT NULL,
    payload        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_loc ON menu_categories(location_id, display_order)`,

  `CREATE TABLE IF NOT EXISTS menu_items (
    id               TEXT PRIMARY KEY NOT NULL,
    location_id      TEXT,
    merchant_id      TEXT,
    menu_id          TEXT,
    category_id      TEXT,
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
    _server_seen_at  TEXT NOT NULL,
    payload          TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mi_loc_cat
     ON menu_items(location_id, category_id, display_order)`,
  `CREATE INDEX IF NOT EXISTS idx_mi_avail ON menu_items(location_id, availability)`,

  `CREATE TABLE IF NOT EXISTS modifier_groups (
    id              TEXT PRIMARY KEY NOT NULL,
    location_id     TEXT,
    name            TEXT,
    updated_at      TEXT,
    _server_seen_at TEXT NOT NULL,
    payload         TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
    menu_item_id      TEXT NOT NULL,
    modifier_group_id TEXT NOT NULL,
    display_order     INTEGER,
    PRIMARY KEY (menu_item_id, modifier_group_id)
  )`,

  // ==========================================================================
  // INVENTORY — names match public.inventory_items / public.vendors.
  // current_stock is a physical quantity, not money: REAL is correct there.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS inventory_items (
    id                  TEXT PRIMARY KEY NOT NULL,
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
    _server_seen_at     TEXT NOT NULL,
    payload             TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ii_loc    ON inventory_items(location_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_ii_low    ON inventory_items(location_id, current_stock)`,
  `CREATE INDEX IF NOT EXISTS idx_ii_vendor ON inventory_items(vendor_id)`,

  `CREATE TABLE IF NOT EXISTS vendors (
    id              TEXT PRIMARY KEY NOT NULL,
    location_id     TEXT NOT NULL,
    name            TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    updated_at      TEXT,
    _server_seen_at TEXT NOT NULL,
    payload         TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_v_loc ON vendors(location_id, is_active)`,

  // ==========================================================================
  // CUSTOMERS — names match public.customers exactly.
  // ==========================================================================
  `CREATE TABLE IF NOT EXISTS customers (
    id                   TEXT PRIMARY KEY NOT NULL,
    merchant_id          TEXT,
    name                 TEXT,
    phone                TEXT,
    email                TEXT,
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
    _server_seen_at      TEXT NOT NULL,
    payload              TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_c_phone ON customers(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_c_name  ON customers(name)`,

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
