/**
 * The local-first write API — what a screen calls instead of an RPC.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §8.1, §9.2
 *
 * ── What "instant" actually means here ─────────────────────────────────────
 *
 * Today a tap waits on the server for the row's IDENTITY, and two toasts exist
 * purely to cover that wait:
 *
 *   "Seating in progress — please wait…"   useOrderStore.ts:8373
 *   "Creating order — please wait…"        useOrderStore.ts:8395
 *
 * Neither is a product decision. Both exist because the order has no id until
 * the server replies. Every function here returns a fully-formed, usable
 * entity SYNCHRONOUSLY-ish — one SQLite transaction, no network — so there is
 * no window left for either toast to describe.
 *
 * ── The contract every function keeps ──────────────────────────────────────
 *
 *   1. The id is minted here and never changes.
 *   2. The row and its sync intent commit in ONE transaction, or neither does.
 *   3. The return value is usable immediately, online or off.
 *   4. A failure returns `ok: false` — it never half-writes.
 *
 * (2) is why these go through `commitLocalWrite` rather than writing the row
 * and queueing separately. That dual write is the thing that loses orders.
 */
import { getReadDb } from "@/lib/db/index";
import {
  amendPendingOpPayload,
  cancelPendingOpsForEntity,
  commitLocalWrite,
  type OutboxEntry,
} from "@/lib/db/outbox";
import { getDeviceId } from "@/lib/deviceId";
import { generateLocalOrderNumbers } from "@/lib/localOrderSequence";
import { markSessionUnsynced } from "@/lib/localFirst/unsyncedSessions";
import { v4 as uuidv4 } from "uuid";

import type {
  AddItemPayload,
  CreateOrderPayload,
  RemoveItemPayload,
  ReplaceModifiersPayload,
  SeatGuestsPayload,
  SendToKitchenPayload,
  SetItemSeatPayload,
  UpdateItemQuantityPayload,
  VoidItemPayload,
} from "@/services/localFirst/opHandlers";

/** `EXPO_PUBLIC_LOCAL_WRITES_*` gate each phase independently. */
export const LOCAL_WRITES_ITEMS =
  process.env.EXPO_PUBLIC_LOCAL_WRITES_ITEMS === "1";
export const LOCAL_WRITES_ORDERS =
  process.env.EXPO_PUBLIC_LOCAL_WRITES_ORDERS === "1";
export const LOCAL_WRITES_SEATING =
  process.env.EXPO_PUBLIC_LOCAL_WRITES_SEATING === "1";

export interface LocalWriteResult<T> {
  ok: boolean;
  error?: string;
  value?: T;
}

const nowIso = () => new Date().toISOString();

/** Existing local order row, if any. Read connection — never blocks a writer. */
async function findLocalOrder(
  orderId: string,
): Promise<{ order_number: string; display_number: string } | null> {
  const db = getReadDb();
  if (!db) return null;
  try {
    return await db.getFirstAsync<{
      order_number: string;
      display_number: string;
    }>(`SELECT order_number, display_number FROM orders WHERE id = ?`, [
      orderId,
    ]);
  } catch {
    return null;
  }
}

/**
 * Ids here are ALWAYS v4 UUIDs — deliberately not routed through
 * `mintId()`/`EXPO_PUBLIC_CLIENT_IDS`.
 *
 * That flag gates the LEGACY path, where it can fall back to
 * `local_order_<ts>_<rand>`. This path has no meaningful "off" state: a
 * `local_`-prefixed id cannot be sent as `p_order_id`/`p_item_id`, because
 * Postgres rejects it on the uuid cast. `idForServer()` would therefore send
 * NULL, the server would mint its OWN id, and the row we already wrote locally
 * would diverge from the row the server created — which is precisely the bug
 * this whole design removes, reintroduced by a flag combination.
 *
 * So the coupling is made structural rather than documented: enabling
 * EXPO_PUBLIC_LOCAL_WRITES_* without EXPO_PUBLIC_CLIENT_IDS is not a
 * degraded mode, and this function makes it unrepresentable.
 */
const mintUuid = (): string => uuidv4();

// ---------------------------------------------------------------------------
// Order creation
// ---------------------------------------------------------------------------

export interface CreateLocalOrderInput {
  merchantId: string;
  locationId: string;
  orderType: string;
  /** Station number drives the local sequence, matching the SQL format. */
  stationNumber?: number | null;
  stationId?: string | null;
  staffId?: string | null;
  tableNumber?: string | null;
  sessionId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  specialInstructions?: string | null;
  /**
   * Reuse an id the caller already minted.
   *
   * The store creates its optimistic order first and keys `ordersById` by that
   * id. Minting a SECOND id here would recreate the exact rekey this design
   * removes, so the caller passes its own and the row adopts it.
   */
  orderId?: string;
  /**
   * Reuse a number the caller already allocated.
   *
   * `startNewOrder` mints one via generateLocalOrderNumbers when it builds the
   * optimistic order. Minting a SECOND one here consumed the per-station
   * sequence twice, so every "New Order" advanced the counter by 2 and left a
   * permanent gap in the day's numbering. The caller owns the number for the
   * same reason it owns the id.
   */
  orderNumber?: string;
  displayNumber?: string;
}

export interface CreatedLocalOrder {
  orderId: string;
  orderNumber: string;
  displayNumber: string;
}

/**
 * Create an order locally. Returns immediately with a real id and a real
 * number — both final (Decision 0.1), both printable.
 */
export async function createLocalOrder(
  input: CreateLocalOrderInput,
): Promise<LocalWriteResult<CreatedLocalOrder>> {
  const orderId = input.orderId ?? mintUuid();

  // Already written by an earlier call for this same order? Return it rather
  // than appending a SECOND create_order op — the row insert is now
  // ON CONFLICT DO NOTHING, but the outbox append is not, and a duplicate op
  // would push the same create twice. (Harmless server-side, since
  // create_order_v4 is idempotent on the id, but it inflates the queue and
  // muddies "is this order synced?".)
  const existing = await findLocalOrder(orderId);
  if (existing) {
    return {
      ok: true,
      value: {
        orderId,
        orderNumber: existing.order_number,
        displayNumber: existing.display_number,
      },
    };
  }
  // Only allocate when the caller has not already. Both must be present —
  // taking one and regenerating the other would desynchronise the display
  // number from the order number, which is worse than either alone.
  const allocated =
    input.orderNumber && input.displayNumber
      ? {
          orderNumber: input.orderNumber,
          displayNumber: input.displayNumber,
        }
      : generateLocalOrderNumbers(
          input.locationId,
          input.stationNumber ?? null,
        );
  const { orderNumber, displayNumber } = allocated;
  const deviceId = getDeviceId();
  const ts = nowIso();

  const payload: CreateOrderPayload = {
    merchantId: input.merchantId,
    locationId: input.locationId,
    orderType: input.orderType,
    orderNumber,
    tableNumber: input.tableNumber ?? null,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    specialInstructions: input.specialInstructions ?? null,
    deviceId,
    staffId: input.staffId ?? null,
    stationId: input.stationId ?? null,
  };

  const result = await commitLocalWrite(
    [
      {
        // ON CONFLICT DO NOTHING: `ensureOrderCreated` is called from several
        // places for the same order (the eager-create effect and the add-item
        // path), and two of them can race past the caller's "already created?"
        // guard. A plain INSERT then fails the whole transaction with
        // "UNIQUE constraint failed: orders.id" and the order never gets
        // written at all — which is strictly worse than the duplicate it was
        // protecting against. The row is keyed by an id the caller owns, so
        // re-running this is a no-op by definition.
        sql: `INSERT INTO orders (
                id, location_id, merchant_id, order_number, display_number,
                order_type, status, table_number, session_id, customer_name,
                customer_phone, station_id, device_id, created_by_staff_id,
                created_at, updated_at, _sync_status, _device_id,
                _server_seen_at, payload
              ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, ?)
              ON CONFLICT(id) DO NOTHING`,
        args: [
          orderId,
          input.locationId,
          input.merchantId,
          orderNumber,
          displayNumber,
          input.orderType,
          input.tableNumber ?? null,
          input.sessionId ?? null,
          input.customerName ?? null,
          input.customerPhone ?? null,
          input.stationId ?? null,
          deviceId,
          input.staffId ?? null,
          ts,
          ts,
          deviceId,
          ts,
          JSON.stringify({ id: orderId, order_number: orderNumber }),
        ],
      },
    ],
    [
      {
        id: uuidv4(),
        op: "create_order",
        entity: "order",
        entityId: orderId,
        orderId,
        payload,
        baseVersion: 0,
      },
    ],
  );

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: { orderId, orderNumber, displayNumber } };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface AddLocalItemInput {
  orderId: string;
  locationId: string;
  menuItemId?: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  cashUnitPrice?: number | null;
  categoryId?: string | null;
  categoryName?: string | null;
  menuId?: string | null;
  menuName?: string | null;
  selectedSizeId?: string | null;
  selectedSizeName?: string | null;
  sizePriceModifier?: number | null;
  modifiers?: unknown;
  specialInstructions?: string | null;
  courseNumber?: number | null;
  seatNumber?: number | null;
  stationId?: string | null;
  /**
   * The CartItem's id — a composite merge key (`<menuItemId>|modifiers:…`),
   * NOT a uuid. Carried through so the drain can bind the resulting row id
   * back onto the correct cart line.
   */
  cartItemId?: string;
}

/**
 * Add an item locally. The returned `itemId` is the real primary key from the
 * first frame, so seat assignment, coursing and the KDS can all reference it
 * immediately — no `db_order_item_id` wait, no reconciliation pass.
 */
export async function addLocalItem(
  input: AddLocalItemInput,
): Promise<LocalWriteResult<{ itemId: string }>> {
  const itemId = mintUuid();
  const deviceId = getDeviceId();
  const ts = nowIso();

  const payload: AddItemPayload = {
    orderId: input.orderId,
    menuItemId: input.menuItemId ?? null,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    cashUnitPrice: input.cashUnitPrice ?? null,
    itemName: input.itemName,
    categoryName: input.categoryName ?? null,
    categoryId: input.categoryId ?? null,
    menuId: input.menuId ?? null,
    menuName: input.menuName ?? null,
    selectedSizeId: input.selectedSizeId ?? null,
    selectedSizeName: input.selectedSizeName ?? null,
    sizePriceModifier: input.sizePriceModifier ?? 0,
    modifiers: input.modifiers ?? null,
    specialInstructions: input.specialInstructions ?? null,
    courseNumber: input.courseNumber ?? 1,
    seatNumber: input.seatNumber ?? null,
    stationId: input.stationId ?? null,
    cartItemId: input.cartItemId ?? itemId,
  };

  const statements = [
    {
      sql: `INSERT INTO order_items (
              id, order_id, menu_item_id, menu_id, category_id, item_name,
              category_name, menu_name, quantity, unit_price_minor,
              cash_unit_price_minor, item_status, course_number, seat_number,
              special_instructions, selected_size_id, selected_size_name,
              created_at, updated_at, _sync_status, _device_id, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [
        itemId,
        input.orderId,
        input.menuItemId ?? null,
        input.menuId ?? null,
        input.categoryId ?? null,
        input.itemName,
        input.categoryName ?? null,
        input.menuName ?? null,
        input.quantity,
        Math.round(input.unitPrice * 100),
        input.cashUnitPrice != null ? Math.round(input.cashUnitPrice * 100) : null,
        input.courseNumber ?? 1,
        input.seatNumber ?? null,
        input.specialInstructions ?? null,
        input.selectedSizeId ?? null,
        input.selectedSizeName ?? null,
        ts,
        ts,
        deviceId,
        JSON.stringify({ id: itemId, order_id: input.orderId }),
      ],
    },
    // Touch the parent so any "has this order changed?" check sees it. Same
    // transaction: an item whose order still looks untouched is how a sync
    // pass skips work it needed to do.
    {
      sql: `UPDATE orders SET updated_at = ? WHERE id = ?`,
      args: [ts, input.orderId],
    },
  ];

  const ops: OutboxEntry[] = [
    {
      id: uuidv4(),
      op: "add_item",
      entity: "order_item",
      entityId: itemId,
      orderId: input.orderId,
      payload,
    },
  ];

  const result = await commitLocalWrite(statements, ops);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: { itemId } };
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

export interface SeatLocalInput {
  tableIds: string[];
  locationId: string;
  merchantId: string;
  partySize: number;
  createOrder: boolean;
  stationNumber?: number | null;
  stationId?: string | null;
  staffId?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  guestNotes?: string | null;
  reservationId?: string | null;
  waitlistId?: string | null;
  tableNumber?: string | null;
  /**
   * Reuse the id and number the caller already minted, for the same reason
   * createLocalOrder does.
   *
   * Every seat gesture creates its optimistic order FIRST — `startNewOrder`,
   * either at the call site (tables screen, waitlist) or inside
   * `seatGuests` — and that order is what `ordersById` is keyed by and what
   * the operator is already looking at. Minting a second id and a second
   * number here wrote a DIFFERENT order to SQLite and to the outbox: the
   * session pointed at the new one, the store still held the old one, and the
   * old one could never sync, never be reached and never give its number
   * back. Seating burned two numbers and orphaned one order every time.
   */
  orderId?: string | null;
  orderNumber?: string | null;
  displayNumber?: string | null;
}

export interface SeatedLocal {
  sessionId: string;
  orderId: string | null;
  orderNumber: string | null;
  displayNumber: string | null;
}

/**
 * Seat a table locally: session + tables + (optionally) the order, all in ONE
 * transaction.
 *
 * This is the function that deletes `isOrderTableStillSeating()` and
 * `hydrateOrderFromSeat()`. Under the old path the session and order ids
 * arrived from `seat_guests_v3` and had to be rekeyed into ten structures;
 * here they exist before the tap finishes, so there is nothing to rekey and no
 * window in which the table is "seating".
 */
export async function seatLocal(
  input: SeatLocalInput,
): Promise<LocalWriteResult<SeatedLocal>> {
  const sessionId = mintUuid();
  const deviceId = getDeviceId();
  const ts = nowIso();

  let orderId: string | null = null;
  let orderNumber: string | null = null;
  let displayNumber: string | null = null;

  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO table_sessions (
              id, location_id, merchant_id, party_size, guest_name, guest_phone,
              guest_notes, reservation_id, waitlist_id, server_staff_id, status,
              is_active, seated_at, created_at, updated_at, _sync_status,
              _device_id, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seated', 1, ?, ?, ?, 'local', ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [
        sessionId,
        input.locationId,
        input.merchantId,
        input.partySize,
        input.guestName ?? null,
        input.guestPhone ?? null,
        input.guestNotes ?? null,
        input.reservationId ?? null,
        input.waitlistId ?? null,
        input.staffId ?? null,
        ts,
        ts,
        ts,
        deviceId,
        JSON.stringify({ id: sessionId }),
      ],
    },
  ];

  input.tableIds.forEach((tableId, index) => {
    statements.push({
      sql: `INSERT OR REPLACE INTO table_session_tables
              (session_id, table_id, location_id, is_primary, seated_position, _device_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        sessionId,
        tableId,
        input.locationId,
        index === 0 ? 1 : 0,
        index,
        deviceId,
      ],
    });
  });

  if (input.createOrder) {
    orderId = input.orderId ?? mintUuid();
    // Both or neither: taking one and regenerating the other would leave the
    // display number pointing at a different sequence than the order number.
    const allocated =
      input.orderNumber && input.displayNumber
        ? {
            orderNumber: input.orderNumber,
            displayNumber: input.displayNumber,
          }
        : generateLocalOrderNumbers(
            input.locationId,
            input.stationNumber ?? null,
          );
    orderNumber = allocated.orderNumber;
    displayNumber = allocated.displayNumber;

    statements.push({
      sql: `INSERT INTO orders (
              id, location_id, merchant_id, order_number, display_number,
              order_type, status, table_number, session_id, customer_name,
              customer_phone, station_id, device_id, created_by_staff_id,
              created_at, updated_at, _sync_status, _device_id,
              _server_seen_at, payload
            ) VALUES (?, ?, ?, ?, ?, 'dine_in', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              session_id = excluded.session_id,
              order_type = excluded.order_type,
              table_number = excluded.table_number,
              updated_at = excluded.updated_at`,
      args: [
        orderId,
        input.locationId,
        input.merchantId,
        orderNumber,
        displayNumber,
        input.tableNumber ?? null,
        sessionId,
        input.guestName ?? null,
        input.guestPhone ?? null,
        input.stationId ?? null,
        deviceId,
        input.staffId ?? null,
        ts,
        ts,
        deviceId,
        ts,
        JSON.stringify({ id: orderId, order_number: orderNumber }),
      ],
    });

    statements.push({
      sql: `UPDATE table_sessions SET order_id = ? WHERE id = ?`,
      args: [orderId, sessionId],
    });
  }

  const payload: SeatGuestsPayload = {
    tableIds: input.tableIds,
    partySize: input.partySize,
    orderId,
    orderNumber,
    guestName: input.guestName ?? null,
    guestPhone: input.guestPhone ?? null,
    guestNotes: input.guestNotes ?? null,
    reservationId: input.reservationId ?? null,
    waitlistId: input.waitlistId ?? null,
    createOrder: input.createOrder,
    stationId: input.stationId ?? null,
    deviceId,
    staffId: input.staffId ?? null,
  };

  // ONE op for the whole gesture, not one per row. seat_guests_v4 is atomic
  // server-side and idempotent on the session id, so splitting this into
  // session + order + link ops would create three chances to half-apply what
  // the server can do in one.
  const result = await commitLocalWrite(statements, [
    {
      id: uuidv4(),
      op: "seat_guests",
      entity: "table_session",
      entityId: sessionId,
      orderId,
      payload,
      baseVersion: 0,
    },
  ]);

  if (!result.ok) return { ok: false, error: result.error };
  // Guard this session against the floor-plan CLEAR sweep until the drain
  // confirms it. See lib/localFirst/unsyncedSessions.ts — without it, the
  // first authoritative snapshot after an offline seat frees the table the
  // guests are sitting at.
  markSessionUnsynced(sessionId);
  return {
    ok: true,
    value: { sessionId, orderId, orderNumber, displayNumber },
  };
}

// ---------------------------------------------------------------------------
// Item mutations
// ---------------------------------------------------------------------------
//
// ── Why these exist at all ────────────────────────────────────────────────
//
// Creating an order and adding items were made local-first; everything you do
// to an item AFTERWARDS was not. Those paths all gate on `db_order_item_id`,
// which by design is only written once the drain confirms the row — so with no
// network it is null forever, and each of them fell through to the legacy MMKV
// queue addressed by the CART id.
//
// That queue cannot resolve a cart id for a local-first item: `resolveItemId`
// reads `offlineIdRegistry`, which only the legacy add path populates. The op
// therefore returns OpBlocked("item_not_synced") on every pass, forever, and
// is eventually dead-lettered. A quantity change, a void, a seat assignment
// made during an outage simply never reached the server — silently, with the
// device showing the operator the change they made.
//
// The row uuid, meanwhile, has existed since `addLocalItem` minted it. These
// functions address the row by that id, so the mutation is expressible the
// instant it happens, and the outbox's per-order FIFO guarantees the
// `add_item` that creates the row drains before anything that modifies it.

export interface UpdateLocalItemQuantityInput {
  orderId: string;
  /** The `order_items` row uuid — NOT the CartItem's composite id. */
  itemId: string;
  quantity: number;
}

/** Change an item's quantity. Works identically online and off. */
export async function updateLocalItemQuantity(
  input: UpdateLocalItemQuantityInput,
): Promise<LocalWriteResult<void>> {
  const ts = nowIso();
  const payload: UpdateItemQuantityPayload = {
    orderId: input.orderId,
    itemId: input.itemId,
    quantity: input.quantity,
  };

  const result = await commitLocalWrite(
    [
      {
        sql: `UPDATE order_items SET quantity = ?, updated_at = ?, _sync_status = 'local' WHERE id = ?`,
        args: [input.quantity, ts, input.itemId],
      },
      { sql: `UPDATE orders SET updated_at = ? WHERE id = ?`, args: [ts, input.orderId] },
    ],
    [
      {
        id: uuidv4(),
        op: "update_item_quantity",
        entity: "order_item",
        entityId: input.itemId,
        orderId: input.orderId,
        payload,
      },
    ],
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export interface VoidLocalItemInput {
  orderId: string;
  itemId: string;
  reason: string;
}

/**
 * Void an item — the soft delete used once a line has been sent to the
 * kitchen, so the record (and the kitchen's copy) survives.
 */
export async function voidLocalItem(
  input: VoidLocalItemInput,
): Promise<LocalWriteResult<void>> {
  const ts = nowIso();
  const payload: VoidItemPayload = {
    orderId: input.orderId,
    itemId: input.itemId,
    reason: input.reason,
  };

  const result = await commitLocalWrite(
    [
      {
        sql: `UPDATE order_items
                 SET is_voided = 1, void_reason = ?, voided_at = ?,
                     updated_at = ?, _sync_status = 'local'
               WHERE id = ?`,
        args: [input.reason, ts, ts, input.itemId],
      },
      { sql: `UPDATE orders SET updated_at = ? WHERE id = ?`, args: [ts, input.orderId] },
    ],
    [
      {
        id: uuidv4(),
        op: "void_item",
        entity: "order_item",
        entityId: input.itemId,
        orderId: input.orderId,
        payload,
      },
    ],
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export interface RemoveLocalItemInput {
  orderId: string;
  itemId: string;
}

export interface RemovedLocalItem {
  /** True when the add was cancelled instead of being pushed and undone. */
  cancelledBeforeSend: boolean;
}

/**
 * Remove an item — the hard delete for a line the kitchen never saw.
 *
 * ── The resurrection this closes ──────────────────────────────────────────
 *
 * Add an item offline, change your mind, remove it. The row goes, but its
 * `add_item` op does not, so the drain dutifully creates the item on the
 * server the moment the network returns and realtime puts it straight back on
 * the check. The legacy queue had `cancelPendingByEntity` for exactly this;
 * the outbox is a DIFFERENT queue and had no equivalent, so cancelling the
 * legacy op protected nothing.
 *
 * If the add never left the device we drop it and say nothing to the server —
 * there is no row to remove. If it HAS been attempted we must assume it
 * landed (a response can be lost after the write commits) and send a real
 * `remove_item`, which is idempotent on an id the server may or may not have.
 */
export async function removeLocalItem(
  input: RemoveLocalItemInput,
): Promise<LocalWriteResult<RemovedLocalItem>> {
  const cancelled = await cancelPendingOpsForEntity(input.itemId);
  const ts = nowIso();

  const statements = [
    { sql: `DELETE FROM order_items WHERE id = ?`, args: [input.itemId] },
    { sql: `UPDATE orders SET updated_at = ? WHERE id = ?`, args: [ts, input.orderId] },
  ];

  if (cancelled.hadUnsentCreate) {
    const result = await commitLocalWrite(statements, []);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, value: { cancelledBeforeSend: true } };
  }

  const payload: RemoveItemPayload = {
    orderId: input.orderId,
    itemId: input.itemId,
  };
  const result = await commitLocalWrite(statements, [
    {
      id: uuidv4(),
      op: "remove_item",
      entity: "order_item",
      entityId: input.itemId,
      orderId: input.orderId,
      payload,
    },
  ]);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: { cancelledBeforeSend: false } };
}

export interface SetLocalItemSeatInput {
  orderId: string;
  itemId: string;
  seatNumber: number | null;
}

/** Assign (or clear) an item's seat. */
export async function setLocalItemSeat(
  input: SetLocalItemSeatInput,
): Promise<LocalWriteResult<void>> {
  const ts = nowIso();
  const payload: SetItemSeatPayload = {
    orderId: input.orderId,
    itemId: input.itemId,
    seatNumber: input.seatNumber,
  };

  const result = await commitLocalWrite(
    [
      {
        sql: `UPDATE order_items SET seat_number = ?, updated_at = ?, _sync_status = 'local' WHERE id = ?`,
        args: [input.seatNumber, ts, input.itemId],
      },
    ],
    [
      {
        id: uuidv4(),
        op: "set_item_seat",
        entity: "order_item",
        entityId: input.itemId,
        orderId: input.orderId,
        payload,
      },
    ],
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export interface ReplaceLocalItemModifiersInput {
  orderId: string;
  itemId: string;
  /** Already FLATTENED to the row shape the RPC inserts. */
  modifiers: unknown[];
}

/** Replace an item's modifier set wholesale. */
export async function replaceLocalItemModifiers(
  input: ReplaceLocalItemModifiersInput,
): Promise<LocalWriteResult<void>> {
  const ts = nowIso();
  const payload: ReplaceModifiersPayload = {
    orderId: input.orderId,
    itemId: input.itemId,
    modifiers: input.modifiers,
  };

  const result = await commitLocalWrite(
    [
      {
        sql: `UPDATE order_items SET updated_at = ?, _sync_status = 'local' WHERE id = ?`,
        args: [ts, input.itemId],
      },
    ],
    [
      {
        id: uuidv4(),
        op: "replace_modifiers",
        entity: "order_item",
        entityId: input.itemId,
        orderId: input.orderId,
        payload,
      },
    ],
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export interface EditLocalItemInput {
  orderId: string;
  itemId: string;
  quantity?: number;
  specialInstructions?: string | null;
  /** Already FLATTENED to the row shape the RPC inserts. */
  modifiers?: unknown[];
}

/**
 * Apply an edit to an item, choosing the cheapest correct expression of it.
 *
 * ── What used to happen instead ───────────────────────────────────────────
 *
 * `updateItemInActiveOrder` syncs an edit only when the line carries a
 * `db_order_item_id`; otherwise it looks for a pending LEGACY `add_item` op
 * and rewrites its params. Under local-first there is no legacy op to find —
 * the add lives in the outbox — so the whole else-branch was a no-op. Change
 * an item's modifiers or notes before the drain confirms it (which offline is
 * always) and the edit existed only on the tablet.
 *
 * If the add has not been sent, the edit is folded INTO it: one create with
 * the right contents, no correction, no extra round trip on a link that is
 * already failing. If it has been sent, real update ops are queued, ordered
 * behind it by the per-order FIFO.
 */
export async function editLocalItem(
  input: EditLocalItemInput,
): Promise<LocalWriteResult<{ amended: boolean }>> {
  const ts = nowIso();
  const patch: Record<string, unknown> = {};
  if (input.quantity != null) patch.quantity = input.quantity;
  if (input.specialInstructions !== undefined) {
    patch.specialInstructions = input.specialInstructions;
  }
  if (input.modifiers !== undefined) patch.modifiers = input.modifiers;
  if (Object.keys(patch).length === 0) {
    return { ok: true, value: { amended: false } };
  }

  const amended = await amendPendingOpPayload(input.itemId, "add_item", patch);

  // The local row is updated either way — it is this device's record of the
  // check, not a mirror of the outbox.
  const rowUpdates: { sql: string; args: (string | number | null)[] }[] = [];
  if (input.quantity != null) {
    rowUpdates.push({
      sql: `UPDATE order_items SET quantity = ?, updated_at = ? WHERE id = ?`,
      args: [input.quantity, ts, input.itemId],
    });
  }
  if (input.specialInstructions !== undefined) {
    rowUpdates.push({
      sql: `UPDATE order_items SET special_instructions = ?, updated_at = ? WHERE id = ?`,
      args: [input.specialInstructions ?? null, ts, input.itemId],
    });
  }

  if (amended) {
    if (rowUpdates.length > 0) {
      const res = await commitLocalWrite(rowUpdates, []);
      if (!res.ok) return { ok: false, error: res.error };
    }
    return { ok: true, value: { amended: true } };
  }

  // The add is already on its way — express the edit as its own ops.
  const ops: OutboxEntry[] = [];
  if (input.quantity != null) {
    const payload: UpdateItemQuantityPayload = {
      orderId: input.orderId,
      itemId: input.itemId,
      quantity: input.quantity,
    };
    ops.push({
      id: uuidv4(),
      op: "update_item_quantity",
      entity: "order_item",
      entityId: input.itemId,
      orderId: input.orderId,
      payload,
    });
  }
  if (input.modifiers !== undefined) {
    const payload: ReplaceModifiersPayload = {
      orderId: input.orderId,
      itemId: input.itemId,
      modifiers: input.modifiers ?? [],
    };
    ops.push({
      id: uuidv4(),
      op: "replace_modifiers",
      entity: "order_item",
      entityId: input.itemId,
      orderId: input.orderId,
      payload,
    });
  }

  if (ops.length === 0 && rowUpdates.length === 0) {
    return { ok: true, value: { amended: false } };
  }
  const res = await commitLocalWrite(rowUpdates, ops);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, value: { amended: false } };
}

// ---------------------------------------------------------------------------
// Send to kitchen
// ---------------------------------------------------------------------------

export interface SendLocalToKitchenInput {
  orderId: string;
  /** `order_items` row uuids. */
  itemIds: string[];
  orderStatus: string;
  itemStatus: string;
  staffId?: string | null;
  stationId?: string | null;
  deviceId?: string | null;
  /** Reuse the caller's keys so a replay is the SAME send, not a second one. */
  sendIdempotencyKey?: string | null;
  itemsIdempotencyKey?: string | null;
}

/**
 * Fire a batch to the kitchen.
 *
 * ── Why this belongs in the outbox and not the legacy queue ───────────────
 *
 * Offline, `_commitKitchenSendForBatch` found zero items carrying a
 * `db_order_item_id` (the drain sets it, and the drain has not run), declared
 * the whole batch "stragglers", and handed them to the legacy queue keyed by
 * CART id. That queue then spent up to an hour returning
 * OpBlocked("items_not_synced") before dead-lettering, because it has no way
 * to map a composite cart key to a row. The send reported "queued" and nothing
 * ever reached the kitchen.
 *
 * Here the batch is addressed by row uuids that already exist, and the
 * outbox's per-order FIFO puts it strictly after the `add_item` ops for those
 * same rows. There is nothing left to resolve and nothing to wait for: when
 * the network returns, the items are created and then routed, in that order,
 * without a barrier or a straggler list.
 */
export async function sendLocalToKitchen(
  input: SendLocalToKitchenInput,
): Promise<LocalWriteResult<void>> {
  if (input.itemIds.length === 0) return { ok: true };
  const ts = nowIso();
  const placeholders = input.itemIds.map(() => "?").join(",");

  const payload: SendToKitchenPayload = {
    orderId: input.orderId,
    itemIds: input.itemIds,
    orderStatus: input.orderStatus,
    itemStatus: input.itemStatus,
    staffId: input.staffId ?? null,
    stationId: input.stationId ?? null,
    deviceId: input.deviceId ?? getDeviceId(),
    sendIdempotencyKey: input.sendIdempotencyKey ?? null,
    itemsIdempotencyKey: input.itemsIdempotencyKey ?? null,
  };

  const result = await commitLocalWrite(
    [
      {
        sql: `UPDATE order_items
                 SET kitchen_status = ?, updated_at = ?
               WHERE id IN (${placeholders})`,
        args: [input.itemStatus, ts, ...input.itemIds],
      },
      {
        sql: `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
        args: [input.orderStatus, ts, input.orderId],
      },
    ],
    [
      {
        // Keyed on the ORDER, not an item: this is one gesture against one
        // check, and `send_order_to_kitchen_v1` applies it atomically. Keying
        // it to an item would also make `cancelPendingOpsForEntity` drop the
        // whole send when that single item is removed.
        id: uuidv4(),
        op: "send_to_kitchen",
        entity: "order",
        entityId: input.orderId,
        orderId: input.orderId,
        payload,
      },
    ],
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
