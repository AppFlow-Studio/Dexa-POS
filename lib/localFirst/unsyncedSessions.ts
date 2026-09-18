/**
 * Which table sessions exist ONLY on this device so far.
 *
 * ── The wipe this exists to stop ───────────────────────────────────────────
 *
 * A locally-seated session is written with `status: 'seated'` — a real,
 * server-meaningful status, deliberately, because the table is genuinely
 * seated the instant the operator taps. That is also what makes it
 * vulnerable: `isLocalOnlyStatus()` guards `seating`/`ordering`/`paying`/
 * `closing`, and 'seated' is none of those.
 *
 * So the floor-plan sweeps in `useTableSessionStore` —
 * `_patchSessionsFromTables({ clearMissing: true })` and
 * `hydrateFromBackend` — treat a table the server reports as free as
 * genuinely free, and CLEAR the session. Offline, or in the seconds between
 * the seat tap and the `seat_guests` op draining, the server DOES report it
 * free. The table flips back to available, the order detaches, and the guests
 * are sitting at a table the POS says is empty.
 *
 * ── Why a synchronous in-memory Set ────────────────────────────────────────
 *
 * The reducers this guards are synchronous Zustand reducers that run inside a
 * batch dispatch. They cannot await a SQLite read, and making them async would
 * put a database round trip inside every floor-plan repaint. The authoritative
 * record is still the outbox; this is a cache of one boolean question,
 * seeded from it at startup and maintained by the two events that can change
 * the answer — a local seat, and that seat draining.
 *
 * Empty is the SAFE default in the direction that matters: an unseeded set
 * behaves exactly like the code did before it existed.
 */
import { unsyncedSessionIds } from "@/lib/db/outbox";

const unsynced = new Set<string>();
let seeded = false;

/**
 * Is this session still only on this device?
 *
 * Synchronous by design — see the header. Called from floor-plan reducers on
 * every backend snapshot.
 */
export function hasUnsyncedSession(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  return unsynced.has(sessionId);
}

/** A session was just written locally. Called by `seatLocal`. */
export function markSessionUnsynced(sessionId: string): void {
  unsynced.add(sessionId);
}

/** The drain confirmed it. Called by the `seat_guests` handler. */
export function markSessionSynced(sessionId: string): void {
  unsynced.delete(sessionId);
}

/**
 * Rebuild from the outbox. Runs once at drain startup, so a session seated in
 * a previous session of the APP is still protected after a restart.
 *
 * Failed ops count too: a session whose seat was REJECTED is even less present
 * on the server than a pending one, and clearing it locally would destroy the
 * only remaining record of it.
 */
export async function seedUnsyncedSessions(): Promise<number> {
  if (seeded) return unsynced.size;
  seeded = true;
  try {
    for (const id of await unsyncedSessionIds()) unsynced.add(id);
  } catch {
    // An unseeded guard degrades to the pre-existing behaviour, never worse.
  }
  return unsynced.size;
}

/** Test seam — the module Set outlives a test file otherwise. */
export function __resetUnsyncedSessionsForTests(): void {
  unsynced.clear();
  seeded = false;
}
