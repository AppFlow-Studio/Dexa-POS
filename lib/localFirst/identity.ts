/**
 * THE IDENTITY GATE, client side.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §1.1, §6
 *
 * ── What this replaces, and why it is the whole fix ────────────────────────
 *
 * `lib/offlineIdRegistry.ts` mints `local_order_1767113883512_k3f9a` — not a
 * UUID, and not the row's real primary key. The server mints the real one and
 * returns it, so every order and item is born with ONE identity and acquires a
 * DIFFERENT one at sync time.
 *
 * Rewriting that reference has to happen atomically across at least ten
 * places: `ordersById`, `dbOrderIdIndex`, `tableOrderIdIndex`,
 * `workingSetOrderIds`, `persistableOrderIds`, the queue's `entity_id`, this
 * registry, `useTableSessionStore`, `useKDSStore`, `useSeatingStore.byOrderId`.
 * Miss one and you get an orphan; race one and you get a duplicate.
 *
 * That IS the reported failure — "order items and seatings fail to sync" —
 * and it is why the codebase carries six separate layers of defense against
 * one disease.
 *
 * When the device mints the real UUID and the server accepts it unchanged,
 * there is nothing to rewrite. The bug becomes unrepresentable rather than
 * defended against.
 *
 * ── Rollout posture ────────────────────────────────────────────────────────
 *
 * Flag-gated and OFF by default. With the flag off this module returns exactly
 * what `generateLocalId()` returned, so the app behaves identically and the
 * flag is a true rollback. Nothing here changes online-vs-offline behaviour on
 * its own — Phase 2 ships fully online-first, which is what makes it safe to
 * land long before the write track.
 */
import { v4 as uuidv4 } from "uuid";

import { generateLocalId, isValidUUID } from "@/lib/offlineIdRegistry";

/**
 * `EXPO_PUBLIC_CLIENT_IDS=1` turns on client-minted UUIDs.
 *
 * Read once at module load, like every other flag in this codebase, so it
 * cannot change under a running order.
 */
export const CLIENT_IDS_ENABLED = process.env.EXPO_PUBLIC_CLIENT_IDS === "1";

export type MintableEntity = "order" | "item" | "session";

/**
 * Mint an id for a new entity.
 *
 * With the flag ON this is the row's REAL primary key, from the first frame,
 * and it will never change. With it off, the legacy `local_`-prefixed id.
 */
export function mintId(entity: MintableEntity): string {
  if (!CLIENT_IDS_ENABLED) {
    return generateLocalId(entity === "item" ? "item" : entity);
  }
  return uuidv4();
}

export const mintOrderId = () => mintId("order");
export const mintItemId = () => mintId("item");
export const mintSessionId = () => mintId("session");

/**
 * Is this id already the server's own primary key?
 *
 * During rollout BOTH schemes coexist: rows written by an older build keep
 * resolving through `offlineIdRegistry` until they settle. Call sites that
 * need to know "can I send this straight to the server?" ask here rather than
 * assuming, because assuming is what produces an orphan.
 */
export function isServerReadyId(id: string | null | undefined): boolean {
  return !!id && isValidUUID(id);
}

/**
 * The id to send to an RPC as the row's primary key, or `null` when the server
 * must mint it.
 *
 * Returning `null` rather than a legacy `local_` id is deliberate and
 * load-bearing: `create_order_v4(p_order_id => NULL)` falls back to
 * `gen_random_uuid()`, which is exactly v3's behaviour. Passing a `local_`
 * string would fail a uuid cast at the database and turn a rollout edge case
 * into a failed order.
 */
export function idForServer(id: string | null | undefined): string | null {
  return isServerReadyId(id) ? (id as string) : null;
}

/**
 * ── DELETION GATE for the legacy machinery ────────────────────────────────
 *
 * `offlineIdRegistry` (530 lines), `dbOrderIdIndex` and its 12+ maintenance
 * sites, `reconcileLostOrderCreations`, the rekey path and the stale-index
 * guards can only be deleted once ZERO `local_`-prefixed ids remain in any
 * persisted store on any device — not on the day the flag flips.
 *
 * A device that was offline across the rollout still holds `local_` orders in
 * MMKV, and deleting the registry underneath them strands those orders
 * permanently. Ship this counter, watch it reach zero for a full retention
 * window, THEN delete. Phase 6.
 */
export function countLegacyIds(ids: Iterable<string>): number {
  let n = 0;
  for (const id of ids) {
    if (id.startsWith("local_")) n++;
  }
  return n;
}
