/**
 * Wave A — Server-truth reconciliation at the Close-Table gate.
 *
 * Context: on a fully-captured, server-settled dine-in check, a lost/late
 * payment finalize response can leave LOCAL `order.paid_status` stuck at
 * "Partial" while the server is `paid` / `amount_due = 0`. The Close-Table
 * gate reads local state, so it traps staff into void/cash — the only exits
 * that damage a correct ledger. Nothing forces a server re-read until an
 * incidental refetch hours later ("it eventually let me clear after a fetch").
 *
 * This module makes that reconciliation DETERMINISTIC at the gate: pull server
 * truth (via the store's authoritative merge) and only offer a one-tap
 * "Sync & Clear" when the order is PROVABLY paid — never on a small residual
 * alone (see `isOrderProvenPaid`).
 *
 * Dark-shipped behind a RUNTIME flag (`dining.syncAndClearEnabled`, remote-
 * synced locationConfig) so it can be disabled on the floor without a rebuild.
 */

import { markEnd, markStart } from "@/lib/perf";
import type { OrderProfile } from "@/lib/types";
import { getIsOnline } from "@/services/offlineSyncService";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";

/** Cent tolerance. Matches `lib/paymentGuards.isNothingLeftToCollect`'s remainder threshold. */
export const PAID_EPSILON = 0.01;

/**
 * Runtime kill-switch. Reads the remote-synced locationConfig so the feature
 * can be toggled per-location without shipping a new build. Defaults OFF.
 */
export function isSyncAndClearEnabled(): boolean {
  try {
    return (
      useLocationConfigStore.getState().config.dining.syncAndClearEnabled ===
      true
    );
  } catch {
    return false;
  }
}

/**
 * PROVEN-PAID invariant — the gate for offering "Sync & Clear".
 *
 * Server truth must POSITIVELY prove the check is covered by real captured
 * payments. A small `amount_due` is only a corroborating check, NEVER the
 * trigger: an order with a single unpaid $0.01 custom item has
 * `amount_due <= 0.01` but is NOT paid, and must fail here.
 *
 * Also guards the documented false-heal in `syncOrderFromBackendComplete`
 * (a duplicate optimistic payment can double `amount_paid` and flip
 * Partial→Paid): any local `pending`/unsynced payment row disqualifies.
 */
export function isOrderProvenPaid(
  order: OrderProfile | null | undefined,
): boolean {
  if (!order) return false;

  const payments = order.payments ?? [];
  const total = order.total_amount;
  const amountPaid = order.amount_paid ?? 0;
  const amountDue = order.amount_due ?? Number.POSITIVE_INFINITY;

  // (1) Authoritative flag — lead with this, never the residual.
  if (order.paid_status !== "Paid") return false;

  // (2) Captured payments actually cover the check.
  if (typeof total !== "number" || amountPaid + PAID_EPSILON < total) {
    return false;
  }
  const capturedPayments = payments.filter((p) => p.status === "captured");
  if (capturedPayments.length === 0) return false;

  // (4) No optimistic / in-flight local payment that could double-count and
  //     false-heal Partial→Paid. A payment still `pending` (uncaptured) or
  //     not yet synced to the backend is not trustworthy server truth.
  const hasUnsettledLocal = payments.some(
    (p) =>
      p.status === "pending" ||
      p.sync_status === "pending" ||
      p.sync_status === "failed",
  );
  if (hasUnsettledLocal) return false;

  // (3) Residual is a corroborating check only.
  if (amountDue > PAID_EPSILON) return false;

  return true;
}

/** Card last-4s of the captured payments — for the "already paid on ••••" copy. */
export function capturedCardSummary(
  order: OrderProfile | null | undefined,
): string {
  const last4s = (order?.payments ?? [])
    .filter((p) => p.status === "captured" && p.last4)
    .map((p) => `••${p.last4}`);
  return last4s.length ? [...new Set(last4s)].join(", ") : "";
}

export type ServerReconcileOutcome =
  | "disabled" // runtime flag off — behave exactly as today
  | "offline" // no server read possible — degrade to today's behavior
  | "no_orders" // nothing to evaluate
  | "already_paid" // proven-paid locally; no server round-trip needed
  | "reconciled_paid" // server reconcile flipped it to proven-paid
  | "still_unpaid" // reconcile ran; genuinely not proven-paid
  | "reconcile_failed"; // the inner sync threw

export interface ServerReconcileResult {
  outcome: ServerReconcileOutcome;
  /** true only when EVERY passed order is proven-paid → safe to Sync & Clear. */
  allProvenPaid: boolean;
  provenPaidOrderIds: string[];
}

/**
 * Lightweight telemetry seam. Structured so a log pipeline / Sentry can count
 * reconcile-fired vs. button-shown vs. fell-through-to-void, and so the fork
 * is observable on the floor. Single chokepoint — wire to Sentry later.
 */
function emitCloseGateTelemetry(
  event:
    | "reconcile_fired"
    | "already_paid"
    | "server_paid_button_shown"
    | "fell_through_to_void"
    | "offline_skip"
    | "disabled_skip",
  data: Record<string, unknown> = {},
): void {
  try {
    // eslint-disable-next-line no-console
    console.log(`[SyncAndClear] ${event}`, data);
  } catch {
    // never let telemetry break the gate
  }
}

/**
 * Reconcile the given LOCAL order ids against server truth, then evaluate the
 * PROVEN-PAID invariant across all of them.
 *
 * - `force: true`  — explicit Close-Table tap: bypass the inner sync's cooldown.
 * - `force: false` — passive mount reconcile: respect the inner 5s cooldown.
 *
 * Only orders that aren't already proven-paid locally incur a server read.
 * `syncOrderFromBackendComplete` expects the LOCAL store key (it resolves
 * `db_order_id` itself) and preserves in-flight optimistic state internally.
 */
export async function reconcileOrdersForClose(
  orderIds: string[],
  opts: { force?: boolean } = {},
): Promise<ServerReconcileResult> {
  const { force = false } = opts;
  const ids = orderIds.filter(Boolean);
  const store = useOrderStore.getState();
  const read = (id: string): OrderProfile | null => store.getOrder(id) ?? null;

  if (ids.length === 0) {
    return { outcome: "no_orders", allProvenPaid: false, provenPaidOrderIds: [] };
  }

  if (!isSyncAndClearEnabled()) {
    emitCloseGateTelemetry("disabled_skip");
    return { outcome: "disabled", allProvenPaid: false, provenPaidOrderIds: [] };
  }

  // Fast path: already proven-paid locally — no server round-trip.
  if (ids.every((id) => isOrderProvenPaid(read(id)))) {
    emitCloseGateTelemetry("already_paid", { orderCount: ids.length });
    return {
      outcome: "already_paid",
      allProvenPaid: true,
      provenPaidOrderIds: ids,
    };
  }

  if (!getIsOnline()) {
    emitCloseGateTelemetry("offline_skip");
    return {
      outcome: "offline",
      allProvenPaid: false,
      provenPaidOrderIds: ids.filter((id) => isOrderProvenPaid(read(id))),
    };
  }

  emitCloseGateTelemetry("reconcile_fired", { orderCount: ids.length, force });
  markStart("pos.close_gate.reconcile", { orderCount: ids.length, force });

  let anyFailed = false;
  await Promise.all(
    ids.map(async (id) => {
      if (isOrderProvenPaid(read(id))) return; // already good — skip the read
      const order = read(id);
      if (!order?.db_order_id) return; // never synced — nothing to reconcile
      try {
        await store.syncOrderFromBackendComplete(id, { force });
      } catch {
        anyFailed = true;
      }
    }),
  );

  const provenPaidOrderIds = ids.filter((id) => isOrderProvenPaid(read(id)));
  const allProvenPaid = ids.every((id) => isOrderProvenPaid(read(id)));

  markEnd("pos.close_gate.reconcile", {
    allProvenPaid,
    provenPaidCount: provenPaidOrderIds.length,
  });

  if (allProvenPaid) {
    emitCloseGateTelemetry("server_paid_button_shown", {
      orderCount: ids.length,
    });
    return { outcome: "reconciled_paid", allProvenPaid: true, provenPaidOrderIds };
  }

  if (anyFailed) {
    return {
      outcome: "reconcile_failed",
      allProvenPaid: false,
      provenPaidOrderIds,
    };
  }

  emitCloseGateTelemetry("fell_through_to_void", { orderCount: ids.length });
  return { outcome: "still_unpaid", allProvenPaid: false, provenPaidOrderIds };
}
