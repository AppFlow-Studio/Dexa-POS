/**
 * Location-wide order numbers, reserved one ahead.
 *
 * In `location_wide` mode every register shares one server counter
 * (`generate_order_number(location, NULL)`), so no register can mint the final
 * number itself. Minting a provisional station number and letting
 * create_order_v4 replace it made the number on screen change a second after
 * "New Order" (#S3-0003 → #0044). Instead each register holds one number taken
 * from the shared counter in advance: New Order uses it at once,
 * create_order_v4 keeps it (it is station-less), and the next one is fetched in
 * the background.
 *
 * With no reservation in hand (offline, a failed fetch, a second order before
 * the refill lands) allocateOrderNumbers falls back to a provisional station
 * number, which the server replaces on sync.
 *
 * nextval never repeats, so two registers can never hold the same number. The
 * reservation is persisted so a restart doesn't strand it, and dropped when the
 * device's day changes. A number reserved and never used is a gap, like a
 * voided order.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { storage } from "@/lib/storage";

interface Reservation {
  locationId: string;
  orderNumber: string;
  displayNumber: string;
  /** Device date when reserved; a new day invalidates it. */
  reservedOn: string;
}

const STORAGE_KEY = "order_number_reservation";

// In-memory copy is authoritative once loaded, MMKV is write-through (same
// reasoning as lib/localOrderSequence.ts): a failed write must never hand the
// same reservation out twice.
let current: Reservation | null | undefined;
let client: SupabaseClient | null = null;
let inflight: Promise<void> | null = null;

function deviceDate(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}${m}${d}`;
}

function load(): Reservation | null {
  if (current === undefined) {
    try {
      const raw = storage.getString(STORAGE_KEY);
      current = raw ? (JSON.parse(raw) as Reservation) : null;
    } catch {
      current = null;
    }
  }
  return current;
}

function save(reservation: Reservation | null): void {
  current = reservation;
  try {
    if (reservation) storage.set(STORAGE_KEY, JSON.stringify(reservation));
    else storage.remove(STORAGE_KEY);
  } catch {
    // Memory still holds the truth for this session.
  }
}

function isUsable(r: Reservation | null, locationId: string): r is Reservation {
  return !!r && r.locationId === locationId && r.reservedOn === deviceDate();
}

/**
 * Hand out the reserved number, once, and start fetching the next. Null when
 * there is none for this location today; the caller mints a provisional one.
 */
export function takeReservedOrderNumber(
  locationId: string,
): { orderNumber: string; displayNumber: string } | null {
  const reservation = load();
  if (reservation) save(null);
  void refillOrderNumberReservation(locationId);

  if (!isUsable(reservation, locationId)) return null;
  return {
    orderNumber: reservation.orderNumber,
    displayNumber: reservation.displayNumber,
  };
}

/**
 * Make sure a number is reserved for `locationId`. Safe to call often: no-op
 * while one is held or a fetch is running. `supabase` is remembered for the
 * refills takeReservedOrderNumber starts.
 */
export function refillOrderNumberReservation(
  locationId: string,
  supabase?: SupabaseClient,
): Promise<void> {
  if (supabase) client = supabase;
  if (!client || isUsable(load(), locationId)) return Promise.resolve();
  if (inflight) return inflight;

  const rpcClient = client;
  inflight = (async () => {
    try {
      const { data, error } = await rpcClient.rpc("generate_order_number", {
        p_location_id: locationId,
        p_station_id: null,
      });
      if (error || typeof data !== "string") return;
      const match = data.match(/^ORD-\d{8}-(\d+)$/);
      if (!match) return;
      save({
        locationId,
        orderNumber: data,
        displayNumber: `#${match[1]}`,
        reservedOn: deviceDate(),
      });
    } catch {
      // Offline: the next New Order falls back to a provisional number.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test seam. */
export function __resetOrderNumberReservationForTests(): void {
  current = undefined;
  client = null;
  inflight = null;
  try {
    storage.remove(STORAGE_KEY);
  } catch {
    // ignore
  }
}
