/**
 * Pre-charge barrier: never take money for a line the server REJECTED.
 *
 * Payments still ride the legacy queue, which needs the server item ids. An
 * item the outbox parked as failed never gets one, so the payment op waits on
 * `item_not_synced` forever — the card is charged, the server shows the order
 * unpaid with the item missing, and a later void used to discard the charge
 * (Charcoal Gardenia S1-0011, 2026-09-25: Vanilla Shake + $108.48 Castles).
 *
 * Only a FAILED op blocks. A merely pending one (offline, slow link) is the
 * normal queueing case: the payment waits behind it and lands when it does.
 */
import * as Sentry from "@sentry/react-native";

import {
  requeueFailedOpsForOrder,
  unsyncedOpCountForOrder,
} from "@/lib/db/outbox";
import { LOCAL_WRITES_ITEMS } from "@/services/localFirst/localWrites";
import {
  nudgeDrain,
  waitForOrderSynced,
} from "@/services/localFirst/outboxDrain";

export type PaymentGateResult =
  | { ok: true }
  | { ok: false; title: string; message: string };

/**
 * The caller shows the block reason in its OWN UI: a toast renders beneath
 * the payment sheet, so a toast-only block looked like a dead Charge button
 * (found in the S1-0011 emulator run).
 */
export async function ensureOrderReadyForPayment(
  dbOrderId: string | null | undefined,
  method: "card" | "cash",
): Promise<PaymentGateResult> {
  if (!LOCAL_WRITES_ITEMS || !dbOrderId) return { ok: true };

  if (await waitForOrderSynced(dbOrderId)) return { ok: true };

  const { failed } = await unsyncedOpCountForOrder(dbOrderId);
  if (failed === 0) return { ok: true };

  // Give the parked ops another go so the operator's next tap can succeed —
  // the drain sanitizes payloads at send time, so a since-fixed bug heals.
  await requeueFailedOpsForOrder(dbOrderId);
  nudgeDrain();

  try {
    Sentry.captureMessage("[LF] payment blocked: order has rejected items", {
      level: "error",
      tags: { lf_event: "payment_blocked_failed_ops", method },
      extra: { order_id: dbOrderId, failed },
    });
  } catch {}

  return {
    ok: false,
    title: "Item not saved",
    message:
      `${failed} change(s) on this order didn't reach the server, so it can't ` +
      `be paid yet. Retrying now — try again in a few seconds. If it keeps ` +
      `failing, remove and re-add the item.`,
  };
}
