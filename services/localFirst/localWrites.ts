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
import { commitLocalWrite, type OutboxEntry } from "@/lib/db/outbox";
import { getDeviceId } from "@/lib/deviceId";
import { generateLocalOrderNumbers } from "@/lib/localOrderSequence";
import { v4 as uuidv4 } from "uuid";

import type {
  AddItemPayload,
  CreateOrderPayload,
  SeatGuestsPayload,
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
    orderId = mintUuid();
    const generated = generateLocalOrderNumbers(
      input.locationId,
      input.stationNumber ?? null,
    );
    orderNumber = generated.orderNumber;
    displayNumber = generated.displayNumber;

    statements.push({
      sql: `INSERT INTO orders (
              id, location_id, merchant_id, order_number, display_number,
              order_type, status, table_number, session_id, customer_name,
              customer_phone, station_id, device_id, created_by_staff_id,
              created_at, updated_at, _sync_status, _device_id,
              _server_seen_at, payload
            ) VALUES (?, ?, ?, ?, ?, 'dine_in', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, ?)`,
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
  return {
    ok: true,
    value: { sessionId, orderId, orderNumber, displayNumber },
  };
}
