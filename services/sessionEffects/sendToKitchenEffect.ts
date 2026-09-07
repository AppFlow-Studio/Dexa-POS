/**
 * Side effect: SEND_TO_KITCHEN
 *
 * After the store optimistically transitions the session to "ordered", this
 * effect performs the traceable composite kitchen send. Failures retain the
 * original station/device/idempotency context in the offline queue.
 */

import { getDeviceId } from "@/lib/deviceId";
import {
  buildKitchenSendQueueParams,
  clearKitchenSendInFlight,
  createKitchenSendContext,
  isTerminalKitchenMutationError,
  markKitchenSendInFlight,
  type KitchenSendContext,
} from "@/lib/kdsSendTraceability";
import {
  getKitchenSentStatus,
  getOrderSentStatus,
} from "@/lib/kitchenStatusUtils";
import { DEADLINES } from "@/lib/network/deadlines";
import type { SessionAction } from "@/lib/sessionActions";
import type {
  KitchenEffectOutcome,
  SideEffectContext,
} from "@/lib/sessionSideEffects";
import { toastService } from "@/lib/toastService";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

function createCurrentContext(): KitchenSendContext {
  return createKitchenSendContext({
    stationId:
      useStoreSettingsStore.getState().selectedStation?.id ?? null,
    deviceId: getDeviceId(),
    staffId:
      useEmployeeStore.getState().getEffectiveCreatorStaffId() ?? null,
  });
}

async function queueKitchenSend(
  localOrderId: string,
  localItemIds: string[],
  context: KitchenSendContext,
  offlineBatch = false,
  resolvedItemIds?: string[],
): Promise<void> {
  await queueFailedOperation(
    "send_to_kitchen",
    buildKitchenSendQueueParams(
      localOrderId,
      localItemIds,
      context,
      {
        orderStatus: getOrderSentStatus(),
        itemStatus: getKitchenSentStatus(),
      },
      {
        ...(offlineBatch ? { offline_batch: true } : {}),
        ...(resolvedItemIds
          ? { resolvedItemIds, unresolvedLocalItemIds: [] }
          : {}),
      },
    ),
    localOrderId,
    undefined,
    undefined,
    { idempotencyKey: context.sendIdempotencyKey },
  );
}

/**
 * This effect's context, with `action` narrowed to the one variant it handles.
 *
 * The type guard below proves the narrowing, but it cannot travel into a helper
 * that declares a plain `SideEffectContext` — there, `action` is the whole
 * union again and every field read is a type error. Naming the narrowed shape
 * is what carries the guard across the call.
 */
type SendToKitchenContext = SideEffectContext & {
  action: Extract<SessionAction, { type: "SEND_TO_KITCHEN" }>;
};

export async function sendToKitchenEffect(
  ctx: SideEffectContext,
): Promise<KitchenEffectOutcome> {
  if (ctx.action.type !== "SEND_TO_KITCHEN") return { status: "skipped" };
  const sendCtx = ctx as SendToKitchenContext;

  // S3: bound the optimistic-status window for this batch. A send that
  // resolves as rejected/skipped clears the marker, so the server wins and the
  // line reads unsent again instead of staying 'sent' forever.
  markKitchenSendInFlight(sendCtx.action.itemIds);
  const outcome = await runSendToKitchenEffect(sendCtx);
  if (outcome.status === "rejected" || outcome.status === "skipped") {
    clearKitchenSendInFlight(sendCtx.action.itemIds);
  }
  return outcome;
}

async function runSendToKitchenEffect(
  ctx: SendToKitchenContext,
): Promise<KitchenEffectOutcome> {
  const { itemIds, orderId } = ctx.action;
  let { dbItemIds, dbOrderId } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();

  if (!supabase) {
    if (itemIds.length > 0) {
      await queueKitchenSend(
        orderId,
        itemIds,
        createCurrentContext(),
        true,
      );
      return { status: "queued" };
    }
    return { status: "skipped" };
  }

  // Item creation and quantity writes must settle before the routing trigger
  // sees the fired rows. Late IDs are captured from the fresh order below.
  // Phase 6 (K9/S4): scope the barrier to THIS batch and give it the real
  // send deadline — the old fixed 800 ms was shorter than a genuine
  // add_order_item round trip, so a slow tablet bailed into the offline queue
  // for what was a normal send.
  await useOrderStore.getState().waitForPendingSyncs(orderId, {
    itemIds,
    maxMs: DEADLINES.sendToKitchen,
  });

  const freshOrder = useOrderStore.getState().ordersById[orderId];
  if (freshOrder) dbOrderId = freshOrder.db_order_id ?? dbOrderId;

  if (!dbOrderId) {
    if (itemIds.length > 0) {
      await queueKitchenSend(
        orderId,
        itemIds,
        createCurrentContext(),
        true,
      );
      return { status: "queued" };
    }
    return { status: "skipped" };
  }

  const sentLocalIds = new Set(itemIds);
  const freshSentItems = (freshOrder?.items ?? []).filter(
    (item) => sentLocalIds.has(item.id) && !!item.db_order_item_id,
  );
  dbItemIds = freshSentItems
    .map((item) => item.db_order_item_id!)
    .filter(Boolean);

  // Stragglers are queued below; if nothing resolves a db id, the outcome is
  // "queued" (stragglers pending) rather than a false "skipped".
  const stragglerIds = (freshOrder?.items ?? [])
    .filter((item) => sentLocalIds.has(item.id) && !item.db_order_item_id)
    .map((item) => item.id);
  if (stragglerIds.length > 0) {
    await queueKitchenSend(
      orderId,
      stragglerIds,
      createCurrentContext(),
      true,
    );
  }

  if (dbItemIds.length === 0) {
    return stragglerIds.length > 0
      ? { status: "queued" }
      : { status: "skipped" };
  }

  const resolvedLocalItemIds = freshSentItems.map((item) => item.id);
  const sendContext = createCurrentContext();
  try {
    const result = await OrderService.sendOrderToKitchen(
      supabase,
      dbOrderId,
      dbItemIds,
      getOrderSentStatus(),
      getKitchenSentStatus(),
      {
        staffId: sendContext.staffId,
        stationId: sendContext.stationId,
        deviceId: sendContext.deviceId,
        idempotencyKey: sendContext.sendIdempotencyKey,
        itemsIdempotencyKey: sendContext.itemsIdempotencyKey,
      },
    );

    if (!result.error) return { status: "sent" };

    if (isTerminalKitchenMutationError(result.error)) {
      toastService.show({
        title: "Kitchen send incomplete",
        message: result.error.hint,
        type: "warning",
        duration: 7000,
      });
      return { status: "rejected", error: result.error };
    }

    await queueKitchenSend(
      orderId,
      resolvedLocalItemIds,
      sendContext,
      false,
      dbItemIds,
    );
    return { status: "queued" };
  } catch (error) {
    console.error("[sendToKitchenEffect] Kitchen send failed:", error);
    await queueKitchenSend(
      orderId,
      resolvedLocalItemIds,
      sendContext,
      false,
      dbItemIds,
    );
    return { status: "queued" };
  }
}
